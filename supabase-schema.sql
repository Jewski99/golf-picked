-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Draft picks table
CREATE TABLE public.draft_picks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  username TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  pick_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, player_id),
  UNIQUE(event_id, user_id, pick_number)
);

-- Enable RLS
ALTER TABLE public.draft_picks ENABLE ROW LEVEL SECURITY;

-- Draft picks policies
CREATE POLICY "Draft picks are viewable by everyone"
  ON public.draft_picks FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own draft picks"
  ON public.draft_picks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Player results table
CREATE TABLE public.player_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  event_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT,
  score INTEGER,
  earnings DECIMAL(12, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, player_id)
);

-- Enable RLS
ALTER TABLE public.player_results ENABLE ROW LEVEL SECURITY;

-- Player results policies
CREATE POLICY "Player results are viewable by everyone"
  ON public.player_results FOR SELECT
  USING (true);

CREATE POLICY "System can update player results"
  ON public.player_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can upsert player results"
  ON public.player_results FOR UPDATE
  USING (true);

-- Season standings table
CREATE TABLE public.season_standings (
  user_id UUID REFERENCES public.profiles(id) PRIMARY KEY,
  username TEXT NOT NULL,
  total_winnings DECIMAL(12, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.season_standings ENABLE ROW LEVEL SECURITY;

-- Season standings policies
CREATE POLICY "Season standings are viewable by everyone"
  ON public.season_standings FOR SELECT
  USING (true);

CREATE POLICY "System can update season standings"
  ON public.season_standings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can upsert season standings"
  ON public.season_standings FOR UPDATE
  USING (true);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.season_standings (user_id, username, total_winnings)
  VALUES (NEW.id, NEW.email, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes for performance
CREATE INDEX idx_draft_picks_event ON public.draft_picks(event_id);
CREATE INDEX idx_draft_picks_user ON public.draft_picks(user_id);
CREATE INDEX idx_player_results_event ON public.player_results(event_id);
CREATE INDEX idx_season_standings_winnings ON public.season_standings(total_winnings DESC);
