import { Role } from './role';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  dealerId?: string;
  avatarInitials?: string;
}
