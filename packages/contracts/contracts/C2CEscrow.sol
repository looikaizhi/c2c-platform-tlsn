// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./C2CTypes.sol";
import "./C2CAdmin.sol";
import "./TLSNVerifier.sol";
import "./lib/UintQueue.sol";

/**
 * @title C2CEscrow
 * @notice 产品上架 + 订单生命周期管理（买家下单、付款、取消、超时赔偿）。
 *         通过引用 C2CAdmin 读取资产/商家信息，通过 TLSNVerifier.verifyAndDelegate()
 *         验证所有支付平台的 TLSN 证明。
 *
 *         新增支付平台无需修改本合约：
 *           1. 部署实现 IPlatformVerifier 的新合约
 *           2. 调用 TLSNVerifier.setPlatformVerifier(newPlatformId, newAddress)
 *           3. 商家上架产品时传入新 platformId 即可
 */
contract C2CEscrow {
    using UintQueue for UintQueue.Queue;
    using SafeERC20 for IERC20;

    // ================================================================
    //                       External Refs
    // ================================================================

    C2CAdmin public adminContract;
    TLSNVerifier public verifier;

    // ================================================================
    //                       Product Storage
    // ================================================================

    struct Order {
        address buyer;
        uint256 amount;
        uint256 rate;
        uint32  rateVersion;  // 下单时汇率版本快照
        uint256 deadline;
        OrderStatus status;
        bytes32 merchantNameHash;  // 下单时商家支付信息快照
        bytes32 merchantIdHash;
    }

    struct Product {
        uint256 productID;
        uint256 cryptoID;
        uint256 fiatID;
        AssetType assetType;
        /// @notice keccak256 of payment platform name, e.g. keccak256("wise"), keccak256("alipay")
        bytes32 platformId;
        uint256 collateralAmount;
        uint256 pendingAmount;
        uint256 buyerEscrowedAmount;
        bool isActive;
        uint256 nextOrderId;
        uint256 activeOrderCount;
        UintQueue.Queue pendingOrderIds;
        mapping(uint256 => Order) orders;
    }

    mapping(address => Product[]) private merchantsProductCrypto;
    mapping(address => Product[]) private merchantsProductFiat;

    // ================================================================
    //                    Buyer Payment Info Storage
    // ================================================================

    /// @dev Temporary buyer payment info for FIAT product orders.
    ///      Stored at placeOrder time, deleted when the order ends (any outcome).
    ///      Key: merchant => productId => orderId => BuyerPaymentInfo
    mapping(address => mapping(uint256 => mapping(uint256 => BuyerPaymentInfo)))
        private buyerOrderPaymentInfo;

    // ================================================================
    //                        Order Storage
    // ================================================================

    /// @dev buyer => merchant => assetType => productId => hasActive
    mapping(address => mapping(address => mapping(uint8 => mapping(uint256 => bool)))) public hasActiveOrder;
    mapping(address => bool) public hasEverOrdered;

    uint256 public constant MAX_PENDING_ORDERS = 200;
    uint256 private constant ORDER_TIMEOUT = 15 minutes;

    // ================================================================
    //                          Events
    // ================================================================

    event ProductListed(
        address indexed merchant,
        uint256 indexed productId,
        AssetType indexed assetType,
        uint256 cryptoID,
        uint256 fiatID,
        uint256 collateralAmount,
        bool isActive
    );
    event ProductStatusChanged(
        address indexed merchant,
        uint256 indexed productId,
        AssetType indexed assetType,
        bool isActive
    );
    event ProductCollateralChanged(
        address indexed merchant,
        uint256 indexed productId,
        AssetType indexed assetType,
        int256 delta,
        uint256 collateralAmount,
        uint256 pendingAmount,
        uint256 buyerEscrowedAmount
    );
    event OrderPlaced(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed orderId,
        uint256 productId,
        AssetType assetType,
        uint256 amount,
        uint256 rate,
        uint256 deadline,
        uint256 salt
    );
    event BuyerPaymentInfoSet(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed orderId,
        bytes32 nameHash,
        bytes32 idHash
    );
    event OrderStatusChanged(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed orderId,
        uint256 productId,
        AssetType assetType,
        OrderStatus status,
        uint256 deadline
    );
    event BuyerEscrowDeposited(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed orderId,
        uint256 productId,
        uint256 amount,
        uint256 totalBuyerEscrowedAmount
    );
    event CompensationPaid(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed orderId,
        uint256 productId,
        uint256 compensationAmount,
        uint256 collateralAmount,
        uint256 buyerEscrowedAmount
    );
    event OrderCancelled(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed productId,
        AssetType assetType,
        uint256 orderId,
        OrderStatus status
    );

    // ================================================================
    //                         Modifiers
    // ================================================================

    modifier onlyMerchant() {
        if (!adminContract.isMerchantActive(msg.sender)) revert NotMerchant();
        _;
    }

    // ================================================================
    //                        Constructor
    // ================================================================

    constructor(address _adminContract, address _verifier) {
        adminContract = C2CAdmin(_adminContract);
        verifier = TLSNVerifier(_verifier);
    }

    // ================================================================
    //                     Product Functions
    // ================================================================

    function _getTokenAddress(uint256 _cryptoID) internal view returns (address) {
        return adminContract.getCryptoTokenAddress(_cryptoID);
    }

    /**
     * @notice List a CRYPTO sell product (merchant sells crypto, buyer pays fiat).
     * @param _cryptoID  Supported crypto asset ID (from C2CAdmin)
     * @param _fiatID    Supported fiat currency ID (from C2CAdmin)
     * @param _amount    Collateral amount in crypto tokens
     * @param _isActive  Whether the product is immediately active
     * @param _platformId keccak256 of the payment platform name (e.g. keccak256("wise"))
     */
    function listCryptoProduct(
        uint256 _cryptoID,
        uint256 _fiatID,
        uint256 _amount,
        bool _isActive,
        bytes32 _platformId
    ) external onlyMerchant {
        if (_cryptoID >= adminContract.getSupportCryptoCount()) revert WrongId();
        if (_fiatID >= adminContract.getSupportFiatCount()) revert WrongId();

        address tokenAddress = _getTokenAddress(_cryptoID);
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 pid = adminContract.incrementSellCount(msg.sender, AssetType.CRYPTO);
        Product storage p = merchantsProductCrypto[msg.sender].push();
        p.productID = pid;
        p.cryptoID = _cryptoID;
        p.fiatID = _fiatID;
        p.assetType = AssetType.CRYPTO;
        p.platformId = _platformId;
        p.collateralAmount = _amount;
        p.isActive = _isActive;

        emit ProductListed(msg.sender, pid, AssetType.CRYPTO, _cryptoID, _fiatID, _amount, _isActive);
    }

    /**
     * @notice List a FIAT sell product (merchant sells fiat, buyer pays crypto upfront).
     * @param _fiatID    Supported fiat currency ID
     * @param _cryptoID  Supported crypto asset ID used as collateral
     * @param _amount    Collateral amount in crypto tokens
     * @param _isActive  Whether the product is immediately active
     * @param _platformId keccak256 of the payment platform name
     */
    function listFiatProduct(
        uint256 _fiatID,
        uint256 _cryptoID,
        uint256 _amount,
        bool _isActive,
        bytes32 _platformId
    ) external onlyMerchant {
        if (_fiatID >= adminContract.getSupportFiatCount()) revert WrongId();
        if (_cryptoID >= adminContract.getSupportCryptoCount()) revert WrongId();

        address tokenAddress = _getTokenAddress(_cryptoID);
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 pid = adminContract.incrementSellCount(msg.sender, AssetType.FIAT);
        Product storage p = merchantsProductFiat[msg.sender].push();
        p.productID = pid;
        p.cryptoID = _cryptoID;
        p.fiatID = _fiatID;
        p.assetType = AssetType.FIAT;
        p.platformId = _platformId;
        p.collateralAmount = _amount;
        p.isActive = _isActive;

        emit ProductListed(msg.sender, pid, AssetType.FIAT, _cryptoID, _fiatID, _amount, _isActive);
    }

    function activeProduct(uint256 _id, AssetType _assetType) external onlyMerchant {
        Product storage p = _getOwnProduct(_id, _assetType);
        if (p.isActive) revert AlreadyActive();
        p.isActive = true;
        emit ProductStatusChanged(msg.sender, p.productID, _assetType, true);
    }

    function inactiveProduct(uint256 _id, AssetType _assetType) external onlyMerchant {
        Product storage p = _getOwnProduct(_id, _assetType);
        if (!p.isActive) revert AlreadyInactive();
        p.isActive = false;
        emit ProductStatusChanged(msg.sender, p.productID, _assetType, false);
    }

    function addAmount(uint256 _id, AssetType _assetType, uint256 _amount) external onlyMerchant {
        Product storage p = _getOwnProduct(_id, _assetType);
        address tokenAddress = _getTokenAddress(p.cryptoID);
        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
        p.collateralAmount += _amount;
        emit ProductCollateralChanged(
            msg.sender, p.productID, _assetType,
            int256(_amount), p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
        );
    }

    function takeAmount(uint256 _id, AssetType _assetType, uint256 _amount) external onlyMerchant {
        Product storage p = _getOwnProduct(_id, _assetType);
        uint256 available = p.collateralAmount - p.pendingAmount;
        if (_amount > available) revert InsufficientPendingLocked();

        address tokenAddress = _getTokenAddress(p.cryptoID);
        IERC20(tokenAddress).safeTransfer(msg.sender, _amount);
        p.collateralAmount -= _amount;
        emit ProductCollateralChanged(
            msg.sender, p.productID, _assetType,
            -int256(_amount), p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
        );
    }

    // ================================================================
    //                   Internal Product Helpers
    // ================================================================

    function _getOwnProduct(uint256 _id, AssetType _assetType) internal view returns (Product storage) {
        return _getProduct(msg.sender, _id, _assetType);
    }

    function _getProduct(
        address _merchant,
        uint256 _productID,
        AssetType _assetType
    ) internal view returns (Product storage) {
        if (_assetType == AssetType.CRYPTO) {
            if (_productID >= merchantsProductCrypto[_merchant].length) revert WrongId();
            return merchantsProductCrypto[_merchant][_productID];
        }
        if (_productID >= merchantsProductFiat[_merchant].length) revert WrongId();
        return merchantsProductFiat[_merchant][_productID];
    }

    function _availableAmount(Product storage p) internal view returns (uint256) {
        return p.collateralAmount - p.pendingAmount;
    }

    // ================================================================
    //                   Order Binding Helpers
    // ================================================================

    /**
     * @notice Compute the expected orderBindingHash for a given order context.
     * @dev Matches the preimage signed by the TLSN verifier server.
     *      Encoding: abi.encodePacked(address(this), uint64(chainid),
     *                merchant, buyer, productId, orderId, uint8(assetType),
     *                amount, rate, deadline)
     */
    function _computeOrderBindingHash(
        address _merchant,
        address _buyer,
        uint256 _productId,
        uint256 _orderId,
        AssetType _assetType,
        uint256 _amount,
        uint256 _rate,
        uint32  _rateVersion,
        uint256 _deadline,
        bytes32 _merchantNameHash,
        bytes32 _merchantIdHash,
        bytes32 _payeeNameHash,
        bytes32 _payeeIdHash
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            address(this),
            uint64(block.chainid),
            _merchant,
            _buyer,
            _productId,
            _orderId,
            uint8(_assetType),
            _amount,
            _rate,
            _rateVersion,
            _deadline,
            _merchantNameHash,
            _merchantIdHash,
            _payeeNameHash,
            _payeeIdHash
        ));
    }

    function getBuyerPaymentInfo(
        address _merchant,
        uint256 _productId,
        uint256 _orderId
    ) external view returns (BuyerPaymentInfo memory) {
        return buyerOrderPaymentInfo[_merchant][_productId][_orderId];
    }

    function _requireOrderBinding(TLSNProof calldata proof, bytes32 expectedHash) internal pure {
        if (proof.orderBindingHash != expectedHash) revert OrderBindingHashMismatch();
    }

    // ================================================================
    //                       Order Functions
    // ================================================================

    function placeOrder(
        address _merchant,
        uint256 _productId,
        AssetType _assetType,
        uint256 _amount,
        BuyerPaymentInfo calldata _buyerInfo
    ) external {
        // 1. 基础校验
        Product storage p = _getProduct(_merchant, _productId, _assetType);
        if (!p.isActive) revert ProductInactive();
        if (!adminContract.isMerchantOpen(_merchant, _productId, uint8(_assetType))) revert MerchantClosed();

        _cleanupExpired(p, _merchant);

        if (p.activeOrderCount >= MAX_PENDING_ORDERS) revert TooManyPending();
        if (hasActiveOrder[msg.sender][_merchant][uint8(_assetType)][_productId]) revert AlreadyHasActiveOrder();
        if (_amount == 0) revert ZeroAmount();
        if (_availableAmount(p) < _amount) revert InsufficientAvailable();

        // 2. USD 上限校验（D-5：1:1，直接比较代币数量）
        if (_amount > adminContract.maxOrderAmount()) revert ExceedsUsdCap();

        // 3. 读取链上汇率
        MerchantRate memory mr = adminContract.getMerchantRate(_merchant, _productId, uint8(_assetType));
        if (mr.publishedAt == 0) revert RateNotPublished();
        if (mr.expiresAt != 0 && block.timestamp > mr.expiresAt) revert RateExpired();

        // 4. 写入订单（共同部分）
        MerchantPaymentInfo memory merchantPayInfo =
            adminContract.getMerchantPaymentInfoForPlatform(_merchant, p.platformId);
        if (!merchantPayInfo.isSet) revert MerchantPaymentInfoNotSet();
        hasActiveOrder[msg.sender][_merchant][uint8(_assetType)][_productId] = true;
        uint256 oid = p.nextOrderId++;
        uint256 deadline = block.timestamp + ORDER_TIMEOUT;
        if (!hasEverOrdered[msg.sender]) hasEverOrdered[msg.sender] = true;

        if (_assetType == AssetType.CRYPTO) {
            // 5. CRYPTO 分支
            p.orders[oid] = Order({
                buyer:            msg.sender,
                amount:           _amount,
                rate:             mr.rate,
                rateVersion:      mr.version,
                deadline:         deadline,
                status:           OrderStatus.PENDING,
                merchantNameHash: merchantPayInfo.nameHash,
                merchantIdHash:   merchantPayInfo.idHash
            });
            p.pendingOrderIds.enqueue(oid);
            p.pendingAmount += _amount;
            p.activeOrderCount++;
            emit OrderPlaced(msg.sender, _merchant, oid, _productId, _assetType, _amount, mr.rate, deadline, 0);
            emit OrderStatusChanged(msg.sender, _merchant, oid, _productId, _assetType, OrderStatus.PENDING, deadline);
        } else {
            // 6. FIAT 分支（合并原 payOrderByCrypto，直接进入 WAITING）
            if (_buyerInfo.nameHash == bytes32(0) || _buyerInfo.idHash == bytes32(0)) revert BuyerPaymentInfoRequired();
            buyerOrderPaymentInfo[_merchant][_productId][oid] = BuyerPaymentInfo({
                nameHash: _buyerInfo.nameHash,
                idHash:   _buyerInfo.idHash,
                isSet:    true
            });
            address tokenAddress = _getTokenAddress(p.cryptoID);
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
            p.buyerEscrowedAmount += _amount;
            p.orders[oid] = Order({
                buyer:            msg.sender,
                amount:           _amount,
                rate:             mr.rate,
                rateVersion:      mr.version,
                deadline:         deadline,
                status:           OrderStatus.WAITING,
                merchantNameHash: merchantPayInfo.nameHash,
                merchantIdHash:   merchantPayInfo.idHash
            });
            p.pendingOrderIds.enqueue(oid);
            p.pendingAmount += _amount;
            p.activeOrderCount++;
            emit BuyerEscrowDeposited(msg.sender, _merchant, oid, _productId, _amount, p.buyerEscrowedAmount);
            emit BuyerPaymentInfoSet(msg.sender, _merchant, oid, _buyerInfo.nameHash, _buyerInfo.idHash);
            emit OrderPlaced(msg.sender, _merchant, oid, _productId, _assetType, _amount, mr.rate, deadline, 0);
            emit OrderStatusChanged(msg.sender, _merchant, oid, _productId, _assetType, OrderStatus.WAITING, deadline);
        }
    }

    function cleanupProductExpired(
        address _merchant,
        uint256 _productId,
        AssetType _assetType
    ) external {
        Product storage p = _getProduct(_merchant, _productId, _assetType);
        _cleanupExpired(p, _merchant);
    }

    function cancelOrder(
        address _merchant,
        uint256 _productId,
        AssetType _assetType,
        uint256 _orderId
    ) external {
        Product storage p = _getProduct(_merchant, _productId, _assetType);
        Order storage o = p.orders[_orderId];
        _requireBuyerPending(o);

        o.status = block.timestamp > o.deadline ? OrderStatus.EXPIRED : OrderStatus.CANCELLED;
        p.pendingAmount -= o.amount;
        p.activeOrderCount--;

        delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];

        emit OrderCancelled(o.buyer, _merchant, _productId, _assetType, _orderId, o.status);
        emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, _assetType, o.status, o.deadline);
        _releaseActive(o.buyer, _merchant, _assetType, _productId);
        _cleanupExpired(p, _merchant);
    }

    // ================================================================
    //          Platform Payment — CRYPTO product (buyer pays fiat)
    // ================================================================

    /**
     * @notice Buyer submits TLSN payment proof to claim escrowed crypto.
     *         Platform-agnostic: delegates verification to the platform verifier
     *         registered for this product's platformId.
     *
     * @param _merchant   Merchant's address
     * @param _productId  Product ID (CRYPTO asset type)
     * @param _orderId    Order ID
     * @param proofs      Array of TLSNProofs (platform-specific count:
     *                      Wise → [contactsProof, transferProof]
     *                      Alipay → [paymentProof])
     *
     * @dev fiatAmountX1000 = mulDiv(amount, rate, 1e33)
     *      assumes token is 18 decimals and rate is 18-decimal precision.
     */
    function payOrderByPlatform(
        address _merchant,
        uint256 _productId,
        uint256 _orderId,
        TLSNProof[] calldata proofs
    ) external {
        Product storage p = _getProduct(_merchant, _productId, AssetType.CRYPTO);
        Order storage o = p.orders[_orderId];
        _requireBuyerPending(o);
        if (block.timestamp > o.deadline) revert OutOfDeadline();

        // Verify orderBindingHash on each proof
        uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate, 1e33);
        string memory targetCurrency = adminContract.getSupportFiatInfo(p.fiatID).fiatName;

        bytes32 expectedBinding = _computeOrderBindingHash(
            _merchant, o.buyer, _productId, _orderId,
            AssetType.CRYPTO, o.amount, o.rate, o.rateVersion, o.deadline,
            o.merchantNameHash, o.merchantIdHash,
            o.merchantNameHash, o.merchantIdHash
        );
        for (uint256 i = 0; i < proofs.length; i++) {
            _requireOrderBinding(proofs[i], expectedBinding);
        }

        // Build standard paramsData and delegate to platform verifier
        bytes memory paramsData = abi.encode(
            fiatAmountX1000,
            targetCurrency,
            o.deadline,
            o.deadline - ORDER_TIMEOUT
        );

        verifier.verifyAndDelegate(p.platformId, false, proofs, paramsData);

        // Release crypto to buyer
        address tokenAddress = _getTokenAddress(p.cryptoID);
        IERC20(tokenAddress).safeTransfer(o.buyer, o.amount);

        p.pendingAmount -= o.amount;
        p.collateralAmount -= o.amount;
        p.activeOrderCount--;
        o.status = OrderStatus.COMPLETED;

        emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.CRYPTO, OrderStatus.COMPLETED, o.deadline);
        emit ProductCollateralChanged(
            _merchant, p.productID, AssetType.CRYPTO,
            -int256(o.amount), p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
        );
        _releaseActive(o.buyer, _merchant, p.assetType, _productId);
        _cleanupExpired(p, _merchant);
    }

    // ================================================================
    //          Platform Payment — FIAT product (merchant pays fiat)
    // ================================================================

    /**
     * @notice Merchant submits TLSN receipt proof that they paid fiat to the buyer.
     *         Platform-agnostic: delegates verification to the platform verifier
     *         registered for this product's platformId.
     *
     * @param _productId  Product ID (FIAT asset type)
     * @param _orderId    Order ID
     * @param proofs      Array of TLSNProofs (platform-specific count)
     *
     * @dev fiatAmountX1000 = mulDiv(amount, rate * 10, 1e18)
     *      FIAT product uses 2-decimal integer rate (e.g. 250 = 2.50 CNY/USDT).
     */
    function receiveCryptoWithPlatformPayment(
        uint256 _productId,
        uint256 _orderId,
        TLSNProof[] calldata proofs
    ) external {
        address _merchant = msg.sender;
        Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
        Order storage o = p.orders[_orderId];
        if (block.timestamp > o.deadline) revert OutOfDeadline();
        if (o.status != OrderStatus.WAITING) revert NotWaiting();

        BuyerPaymentInfo storage buyerInfo = buyerOrderPaymentInfo[_merchant][_productId][_orderId];
        if (!buyerInfo.isSet) revert BuyerPaymentInfoNotSet();

        // Verify orderBindingHash on each proof
        uint256 fiatAmountX1000 = Math.mulDiv(o.amount, o.rate * 10, 1e18);
        string memory targetCurrency = adminContract.getSupportFiatInfo(p.fiatID).fiatName;

        bytes32 expectedBinding = _computeOrderBindingHash(
            _merchant, o.buyer, _productId, _orderId,
            AssetType.FIAT, o.amount, o.rate, o.rateVersion, o.deadline,
            o.merchantNameHash, o.merchantIdHash,
            buyerInfo.nameHash, buyerInfo.idHash
        );
        for (uint256 i = 0; i < proofs.length; i++) {
            _requireOrderBinding(proofs[i], expectedBinding);
        }

        // Build standard paramsData with buyer as counterparty
        bytes memory paramsData = abi.encode(
            fiatAmountX1000,
            targetCurrency,
            o.deadline,
            o.deadline - ORDER_TIMEOUT
        );

        verifier.verifyAndDelegate(p.platformId, true, proofs, paramsData);

        // Release escrowed crypto to merchant
        address tokenAddress = _getTokenAddress(p.cryptoID);
        IERC20(tokenAddress).safeTransfer(_merchant, o.amount);

        p.pendingAmount -= o.amount;
        p.buyerEscrowedAmount -= o.amount;
        p.activeOrderCount--;
        o.status = OrderStatus.COMPLETED;

        delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];

        emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.COMPLETED, o.deadline);
        emit ProductCollateralChanged(
            _merchant, p.productID, AssetType.FIAT,
            0, p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
        );
        _releaseActive(o.buyer, _merchant, p.assetType, _productId);
        _cleanupExpired(p, _merchant);
    }

    function claimRefundAfterTimeout(
        address _merchant,
        uint256 _productId,
        uint256 _orderId
    ) external {
        Product storage p = _getProduct(_merchant, _productId, AssetType.FIAT);
        Order storage o = p.orders[_orderId];
        _requireBuyerWaiting(o);
        if (block.timestamp <= o.deadline) revert NotYetExpired();

        _claimCompensation(p, o, _merchant, _orderId);

        o.status = OrderStatus.EXPIRED;
        p.pendingAmount -= o.amount;
        p.activeOrderCount--;

        delete buyerOrderPaymentInfo[_merchant][_productId][_orderId];

        emit OrderStatusChanged(o.buyer, _merchant, _orderId, _productId, AssetType.FIAT, OrderStatus.EXPIRED, o.deadline);
        _releaseActive(o.buyer, _merchant, p.assetType, _productId);
        _cleanupExpired(p, _merchant);
    }

    // ================================================================
    //                    View Functions
    // ================================================================

    /**
     * @notice Read a single order's details.
     * @param _merchant   Merchant's address
     * @param _productId  Product ID
     * @param _assetType  0 = CRYPTO, 1 = FIAT
     * @param _orderId    Order ID
     */
    function getOrder(
        address _merchant,
        uint256 _productId,
        uint8 _assetType,
        uint256 _orderId
    ) external view returns (
        address buyer,
        uint256 amount,
        uint256 rate,
        uint256 deadline,
        uint8 status,
        uint32 rateVersion
    ) {
        Product storage p = _getProduct(_merchant, _productId, AssetType(_assetType));
        Order storage o = p.orders[_orderId];
        return (o.buyer, o.amount, o.rate, o.deadline, uint8(o.status), o.rateVersion);
    }

    /**
     * @notice Return the platformId stored for a product.
     */
    function getProductPlatformId(
        address _merchant,
        uint256 _productId,
        AssetType _assetType
    ) external view returns (bytes32) {
        return _getProduct(_merchant, _productId, _assetType).platformId;
    }

    // ================================================================
    //                    Internal Order Helpers
    // ================================================================

    function _releaseActive(address buyer, address merchant, AssetType assetType, uint256 productId) internal {
        delete hasActiveOrder[buyer][merchant][uint8(assetType)][productId];
    }

    function _requireBuyerPending(Order storage o) internal view {
        if (o.buyer == address(0)) revert OrderNotFound();
        if (o.status != OrderStatus.PENDING) revert NotPending();
        if (msg.sender != o.buyer) revert NotAllowed();
    }

    function _requireBuyerWaiting(Order storage o) internal view {
        if (o.buyer == address(0)) revert OrderNotFound();
        if (o.status != OrderStatus.WAITING) revert NotWaiting();
        if (msg.sender != o.buyer) revert NotAllowed();
    }

    function _cleanupExpired(Product storage p, address merchant) internal {
        uint256 steps = 0;
        while (!p.pendingOrderIds.isEmpty() && steps < MAX_PENDING_ORDERS) {
            uint256 oid = p.pendingOrderIds.peek();
            Order storage o = p.orders[oid];

            if (o.status != OrderStatus.PENDING && o.status != OrderStatus.WAITING) {
                p.pendingOrderIds.dequeue();
                delete buyerOrderPaymentInfo[merchant][p.productID][oid];
                delete p.orders[oid];
                steps++;
                continue;
            }

            if (o.deadline > block.timestamp) break;

            if (o.status == OrderStatus.WAITING) {
                _claimCompensation(p, o, merchant, oid);
            }

            o.status = OrderStatus.EXPIRED;
            p.pendingAmount -= o.amount;
            p.activeOrderCount--;
            p.pendingOrderIds.dequeue();
            emit OrderStatusChanged(o.buyer, merchant, oid, p.productID, p.assetType, OrderStatus.EXPIRED, o.deadline);
            _releaseActive(o.buyer, merchant, p.assetType, p.productID);
            delete buyerOrderPaymentInfo[merchant][p.productID][oid];
            delete p.orders[oid];
            steps++;
        }
    }

    function _claimCompensation(Product storage p, Order storage o, address merchant, uint256 orderId) internal {
        if (p.assetType == AssetType.FIAT) {
            address tokenAddress = _getTokenAddress(p.cryptoID);
            IERC20(tokenAddress).safeTransfer(o.buyer, o.amount * 2);
            p.collateralAmount -= o.amount;
            p.buyerEscrowedAmount -= o.amount;
            emit CompensationPaid(
                o.buyer, merchant, orderId, p.productID,
                o.amount * 2, p.collateralAmount, p.buyerEscrowedAmount
            );
            emit ProductCollateralChanged(
                merchant, p.productID, AssetType.FIAT,
                -int256(o.amount), p.collateralAmount, p.pendingAmount, p.buyerEscrowedAmount
            );
        }
    }
}
