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

export interface Token {
  token_address: string;
  name: string | null;
  symbol: string | null;
  image_uri?: string | null;
  creator?: string | null;
  created_at: string | null;
  total_harvested_amount?: string | null;
  unclaimed_amount?: string | null;
}

export interface Launch {
  royalty_token_address: string;
  creator_address: string | null;
  ip_id: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  image_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  website_url: string | null;
  metadata_uri: string | null;
}
