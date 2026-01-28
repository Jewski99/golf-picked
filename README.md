# Golf Pick'em League - 2026 PGA Tour Season

A free, fully-automated Golf Pick'em league application for you and 5 friends to compete throughout the 2026 PGA Tour season.

## Features

✅ **Weekly Linear Draft** - Draft 4 golfers each week in reverse standings order  
✅ **Live Leaderboard** - Real-time tournament scores for your drafted players  
✅ **Season Standings** - Track cumulative prize money all year long  
✅ **Event-by-Event Results** - See who won each tournament  
✅ **100% Automated** - No manual updates needed  
✅ **Completely Free** - Uses free tiers of Supabase, Vercel, and LiveGolf API  

## Tech Stack

- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Golf Data**: LiveGolf API (Free)
- **Authentication**: Supabase Auth

## Setup Instructions

### Step 1: Clone/Download the Project

If you have Git installed:
```bash
git clone <your-repo-url>
cd golf-pickem
```

Or simply download and extract the ZIP file.

### Step 2: Set Up Supabase (Database)

1. Go to [supabase.com](https://supabase.com) and sign up for a free account
2. Click "New Project"
3. Fill in:
   - Project name: `golf-pickem`
   - Database password: Choose a strong password (save it!)
   - Region: Choose closest to you
4. Wait for the project to finish setting up (~2 minutes)

5. **Set up the database schema**:
   - In your Supabase dashboard, click "SQL Editor" in the left sidebar
   - Click "New Query"
   - Copy the entire contents of `supabase-schema.sql` from this project
   - Paste it into the SQL editor
   - Click "RUN" to execute
   - You should see "Success. No rows returned"

6. **Get your Supabase credentials**:
   - Click "Settings" (gear icon) in the left sidebar
   - Click "API"
   - Copy the following and save them (you'll need them in Step 4):
     - Project URL (looks like: `https://xxxxx.supabase.co`)
     - `anon` `public` API key (the longer one)

7. **Configure email authentication** (optional but recommended):
   - Go to "Authentication" → "Providers" in Supabase
   - Make sure "Email" is enabled
   - Under "Auth" → "URL Configuration", add your Vercel URL once deployed (Step 5)

### Step 3: Get LiveGolf API Key

1. Go to [livegolfapi.com](https://livegolfapi.com)
2. Click "Get API Key" or "Documentation"
3. Sign up for a free account
4. Copy your API key (it's completely free with no rate limits for this use case)

### Step 4: Configure Environment Variables

1. In your project folder, rename `.env.example` to `.env.local`
2. Open `.env.local` and fill in your credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
NEXT_PUBLIC_LIVEGOLF_API_KEY=your_livegolf_api_key_here
```

### Step 5: Deploy to Vercel

**Option A: Deploy via GitHub (Recommended)**

1. Create a GitHub account if you don't have one
2. Create a new repository on GitHub
3. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/golf-pickem.git
   git push -u origin main
   ```

4. Go to [vercel.com](https://vercel.com) and sign up (use your GitHub account)
5. Click "New Project"
6. Import your `golf-pickem` repository
7. Configure your project:
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./`
   - Click "Environment Variables" and add:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `NEXT_PUBLIC_LIVEGOLF_API_KEY`
8. Click "Deploy"
9. Wait 2-3 minutes for deployment to complete
10. Your app will be live at `https://your-app-name.vercel.app`

**Option B: Deploy via Vercel CLI**

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts and add your environment variables when asked

### Step 6: Add Your Friends

1. Share your Vercel app URL with your 5 friends
2. Have each person:
   - Visit the app
   - Click "Sign Up"
   - Create an account with their email
   - Check their email for confirmation link
   - Confirm their email
   - Sign in

3. **Important**: After all 6 people have signed up, update usernames in Supabase:
   - Go to your Supabase dashboard
   - Click "Table Editor" → "profiles"
   - Click on each user and update their `username` to something friendly (like "Mike" instead of "mike@email.com")
   - Also update "season_standings" table usernames to match

### Step 7: Start Using!

1. **Before each tournament week**:
   - Everyone logs into the app
   - The app automatically loads the current PGA Tour event
   - Navigate to the "Draft" tab
   - Draft in order (lowest season earnings drafts first)
   - Each person drafts 4 golfers

2. **During the tournament**:
   - Check the "Leaderboard" tab to see live scores
   - Leaderboard updates automatically every 2 minutes
   - Prize money updates automatically

3. **After the tournament**:
   - Check "Standings" to see:
     - Season-long total winnings
     - Individual tournament results

## How the Draft Order Works

- Draft order is determined by **reverse order of season-long total prize money**
- The person with the LOWEST total winnings drafts first
- This keeps the league competitive all season long
- In Week 1, draft order will be random (everyone at $0)
- After Week 1, the draft order automatically updates based on standings

## Troubleshooting

### "Invalid API Key" Error
- Double-check your API keys in Vercel environment variables
- Make sure there are no extra spaces
- Redeploy after updating environment variables

### Draft Not Working
- Make sure all 6 people have signed up and confirmed their emails
- Check Supabase "profiles" table to ensure all users are created
- Check browser console for errors

### Leaderboard Not Updating
- The leaderboard auto-refreshes every 2 minutes
- During non-tournament times, data may be limited
- Check that the LiveGolf API is working: https://livegolfapi.com

### Players Not Showing
- Make sure you've selected the current event from the dropdown
- Check that the event has started
- Verify LiveGolf API is returning player data

## Costs

This application is designed to be **100% FREE**:

- **Supabase Free Tier**: 500MB database, 50,000 monthly active users (way more than needed)
- **Vercel Free Tier**: Unlimited personal projects, 100GB bandwidth/month
- **LiveGolf API**: Completely free, no rate limits for this use case

As long as you stay within these limits (which you will with 6 users), there are NO costs.

## Customization

### Change Number of Players
If you want more or fewer than 6 players, you just need to invite more/fewer people. The draft will automatically adjust.

### Change Number of Picks
To change from 4 picks per person to a different number:
1. Edit `components/DraftRoom.tsx`
2. Change line: `const canStillDraft = myPicks.length < 4;` to your desired number
3. Update the display logic as well
4. Redeploy to Vercel

### Customize Styling
All styling is in the component files using Tailwind CSS. Feel free to modify colors, fonts, etc.

## Support

If you run into issues:
1. Check the troubleshooting section above
2. Check browser console for errors (F12)
3. Check Supabase logs in the dashboard
4. Verify all environment variables are set correctly in Vercel

## Season Schedule

The app automatically pulls the 2026 PGA Tour schedule from the LiveGolf API. It will:
- Show the current week's tournament
- Allow you to select any upcoming tournament
- Track all results throughout the season

## Important Notes

- **Email Confirmation**: Users MUST confirm their email before they can use the app
- **Weekly Drafts**: Complete the draft before the tournament starts (typically Thursday)
- **Standings Updates**: Happen automatically as tournament results come in
- **Data Persistence**: All data is saved in Supabase and persists forever

## License

Free to use for personal leagues. Have fun! 🏌️‍♂️

---

Built with ❤️ for golf fans
