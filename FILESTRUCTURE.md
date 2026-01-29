# 📁 File Structure Overview

Here's what each file does in your Golf Pick'em app:

## Main Application Files

```
golf-pickem/
│
├── app/                          # Next.js app directory
│   ├── page.tsx                  # Main app page (login + navigation)
│   ├── layout.tsx                # App layout wrapper
│   └── globals.css               # Global styles
│
├── components/                   # Reusable components
│   ├── EventSelector.tsx         # Shows current PGA tournament
│   ├── DraftRoom.tsx             # Weekly draft interface
│   ├── Leaderboard.tsx           # Live tournament scores
│   └── Standings.tsx             # Season standings & results
│
├── Configuration Files
│   ├── package.json              # Dependencies & scripts
│   ├── next.config.js            # Next.js configuration
│   ├── tsconfig.json             # TypeScript configuration
│   ├── tailwind.config.js        # Styling configuration
│   ├── postcss.config.js         # CSS processing
│   └── .gitignore                # Files to exclude from Git
│
├── Setup & Documentation
│   ├── README.md                 # Complete documentation
│   ├── QUICKSTART.md             # Step-by-step setup guide
│   ├── TROUBLESHOOTING.md        # Problem-solving guide
│   ├── FILESTRUCTURE.md          # This file!
│   └── supabase-schema.sql       # Database setup script
│
└── Environment
    ├── .env.example              # Template for environment variables
    └── .env.local                # Your actual environment variables (create this)
```

## File Descriptions

### App Files

**app/page.tsx**
- The main page of your application
- Handles user authentication (login/signup)
- Shows the navigation tabs (Draft, Leaderboard, Standings)
- Manages the overall app state

**app/layout.tsx**
- Wraps the entire app
- Sets up global HTML structure
- Imports global styles
- Sets page title and metadata

**app/globals.css**
- Global CSS styles
- Tailwind CSS imports
- Custom fonts (Bebas Neue)
- Scrollbar styling

### Component Files

**components/EventSelector.tsx**
- Fetches current PGA Tour events from LiveGolf API
- Displays current tournament information
- Allows selecting different tournaments
- Shows tournament location, dates, and course

**components/DraftRoom.tsx**
- Main drafting interface
- Shows draft order (based on reverse standings)
- Lists all available players
- Allows users to pick their 4 golfers
- Real-time updates when players are drafted
- Shows "Your Turn" indicator

**components/Leaderboard.tsx**
- Fetches live tournament scores
- Shows only the 24 drafted players
- Displays position, score, and prize money
- Auto-refreshes every 2 minutes
- Updates player earnings in database

**components/Standings.tsx**
- Shows season-long total winnings
- Displays tournament-by-tournament results
- Ranked leaderboard with trophy for first place
- Historical results for each event

### Configuration Files

**package.json**
- Lists all required packages (React, Next.js, Supabase, etc.)
- Defines build and run scripts
- Manages dependencies

**next.config.js**
- Configures Next.js framework
- Sets up image domains
- Enables React strict mode

**tsconfig.json**
- TypeScript compiler settings
- Path aliases (@/ for root)
- Type checking rules

**tailwind.config.js**
- Tailwind CSS configuration
- Content paths for CSS
- Custom theme extensions

**postcss.config.js**
- CSS processing configuration
- Tailwind plugin setup

**.gitignore**
- Tells Git which files to ignore
- Excludes node_modules, .env files, etc.
- Prevents sensitive data from being uploaded

### Database & Setup

**supabase-schema.sql**
- SQL script to create all database tables
- Sets up Row Level Security (RLS)
- Creates indexes for performance
- Defines automatic triggers
- This file is run ONCE in Supabase SQL Editor

### Documentation Files

**README.md**
- Complete project documentation
- Feature list
- Full setup instructions
- Troubleshooting basics
- Customization guide

**QUICKSTART.md**
- Beginner-friendly setup guide
- Step-by-step with screenshots descriptions
- No coding knowledge assumed
- Covers GitHub, Supabase, and Vercel setup

**TROUBLESHOOTING.md**
- Common issues and solutions
- How to debug problems
- Error message explanations
- Emergency reset procedures

**FILESTRUCTURE.md**
- This file!
- Explains what each file does
- Helps you navigate the codebase

### Environment Variables

**.env.example**
- Template showing which variables you need
- Safe to commit to GitHub
- Instructions for what to put in each variable

**.env.local**
- Your ACTUAL environment variables
- Contains your API keys and secrets
- NEVER commit this to GitHub (it's in .gitignore)
- Create this file locally based on .env.example

## How Files Work Together

### User Flow

1. User visits app → **app/page.tsx** loads
2. Not logged in? → Shows auth form in **app/page.tsx**
3. User signs up → Supabase creates account
4. Supabase trigger → Creates profile in **database**
5. User logs in → **app/page.tsx** shows main app
6. User clicks Draft tab → **DraftRoom.tsx** component loads
7. Draft component → Fetches data from **Supabase** and **LiveGolf API**
8. User drafts player → Saved to **draft_picks** table
9. Tournament starts → **Leaderboard.tsx** shows live scores
10. Scores update → **player_results** and **season_standings** tables update
11. User checks standings → **Standings.tsx** shows rankings

### Data Flow

```
LiveGolf API → EventSelector → Shows tournaments
     ↓
LiveGolf API → DraftRoom → Available players
     ↓
User Draft → Supabase draft_picks table
     ↓
LiveGolf API → Leaderboard → Live scores + earnings
     ↓
Leaderboard → Supabase player_results table
     ↓
Auto calculation → Supabase season_standings table
     ↓
Standings component → Shows final rankings
```

## Which Files Can You Edit Safely?

### Safe to Edit (won't break anything)
- **.env.local** - Add your API keys here
- **README.md** - Add your own notes
- Any text content in component files (button labels, etc.)

### Edit with Caution (need to know what you're doing)
- **app/globals.css** - Change colors, fonts
- **tailwind.config.js** - Modify theme
- Component files - Change styling classes

### Don't Edit (will likely break the app)
- **package.json** - Unless you know what packages are
- **tsconfig.json** - TypeScript compiler settings
- **next.config.js** - Framework configuration
- **supabase-schema.sql** - Database schema (run once only)
- **.gitignore** - Important for security

## How to Make Changes

If you want to customize the app:

1. **Colors**: Search for `emerald-600`, `slate-900`, etc. in component files
2. **Text**: Change any text you see in quotes
3. **Number of picks**: Change the `4` in `myPicks.length < 4`
4. **Styling**: Modify Tailwind classes (e.g., `p-6` = padding, `text-xl` = text size)

After making changes:
1. Save the file
2. Upload to GitHub (if using GitHub)
3. Vercel will auto-deploy (takes 2-3 minutes)
4. Refresh your app to see changes

## File Sizes

Approximate sizes to help you identify files:

- **Small** (< 5KB): Config files, .gitignore, .env files
- **Medium** (5-20KB): Component files, schema file
- **Large** (> 20KB): README, QUICKSTART, this file

## Need to Start Over?

If you mess something up, you can always:

1. Re-download the original files
2. Upload them to GitHub again
3. Redeploy on Vercel
4. Your database data in Supabase is safe!

## Summary

You really only need to interact with:
- **.env.local** (add your API keys)
- **supabase-schema.sql** (run once in Supabase)
- **README.md** or **QUICKSTART.md** (follow setup instructions)

Everything else is already configured and ready to go!
