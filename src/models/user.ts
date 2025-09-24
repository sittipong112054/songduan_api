export interface CreateUserDto {
    role: 'USER' | 'RIDER';
    phone: string;
    username: string;
    password: string;
    name: string;
    avatar_url?: string | null;
}

export interface UpdateUserDto {
    name?: string;
    avatar_url?: string;
}