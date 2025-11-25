export interface Profile {
  wallet_address: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Comment {
  id: string; // uuid or bigint as string
  token_address: string;
  user_address: string;
  content: string;
  created_at: string;
}
