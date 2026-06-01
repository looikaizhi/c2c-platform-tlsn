import { apiFetch } from '../http';
import { ENDPOINTS, type UserRoleResponse } from '../endpoints';

export const userApi = {
    role: (wallet: string) =>
        apiFetch<UserRoleResponse>(ENDPOINTS.userRole(wallet)),
};
