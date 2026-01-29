# 🎯 Quick Start Guide - For Beginners

Since you mentioned you have no coding experience, I've created this step-by-step guide that will walk you through EVERYTHING. Follow each step carefully!

## What You'll Need

- A computer with internet access
- A GitHub account (we'll create one)
- A Supabase account (we'll create one)
- A Vercel account (we'll create one)
- About 30-45 minutes to set everything up

## Part 1: Get the Code on GitHub

### 1. Create a GitHub Account
1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Follow the steps to create your account
4. Verify your email

### 2. Create a New Repository
1. Once logged into GitHub, click the "+" button in the top right
2. Click "New repository"
3. Name it: `golf-pickem`
4. Make it "Public" (unless you want private)
5. Check "Add a README file"
6. Click "Create repository"

### 3. Upload Your Code
1. Download all the files I created for you
2. In your new GitHub repository, click "Add file" → "Upload files"
3. Drag and drop ALL the files from the `golf-pickem` folder
4. Scroll down and click "Commit changes"

## Part 2: Set Up Supabase (Your Database)

### 1. Create Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up using your GitHub account (easiest way)

### 2. Create Your Project
1. Click "New project"
2. Choose your organization (or create one)
3. Fill in:
   - **Name**: `golf-pickem`
   - **Database Password**: Create a strong password (SAVE THIS!)
     - Example: `GolfRocks2026!`
   - **Region**: Choose the one closest to you
   - **Pricing Plan**: Free
4. Click "Create new project"
5. Wait 2-3 minutes for it to set up

### 3. Set Up Your Database Tables
1. Once your project is ready, click "SQL Editor" in the left sidebar
2. Click "+ New query"
3. Open the file `supabase-schema.sql` I created
4. Copy EVERYTHING in that file
5. Paste it into the Supabase SQL editor
6. Click "RUN" in the bottom right
7. You should see "Success. No rows returned" - that's good!

### 4. Get Your Supabase Keys
1. Click the "Settings" icon (gear) in the left sidebar
2. Click "API"
3. You'll see two important things - COPY THESE SOMEWHERE SAFE:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon public** key (the long string under "Project API keys")

## Part 3: Get Your Golf Data API Key

### 1. Sign Up for LiveGolf API
1. Go to [livegolfapi.com](https://livegolfapi.com)
2. Click "Get API Key" or "Documentation"
3. Sign up with your email
4. Copy your API key (SAVE THIS!)

The API is completely free - no credit card needed!

## Part 4: Deploy Your App on Vercel

### 1. Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Click "Sign Up"
3. Choose "Continue with GitHub" (easiest way)
4. Authorize Vercel to access your GitHub

### 2. Import Your Project
1. Click "Add New..." → "Project"
2. Find your `golf-pickem` repository
3. Click "Import"

### 3. Configure Your Project
1. **Framework Preset**: Next.js (should auto-detect)
2. **Root Directory**: Leave as `./`
3. **Build Settings**: Don't change anything

### 4. Add Environment Variables
This is IMPORTANT! Click "Environment Variables" and add these THREE variables:

**Variable 1:**
- **Name**: `NEXT_PUBLIC_SUPABASE_URL`
- **Value**: Paste your Supabase Project URL (from Part 2, Step 4)

**Variable 2:**
- **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Value**: Paste your Supabase anon public key (from Part 2, Step 4)

**Variable 3:**
- **Name**: `NEXT_PUBLIC_LIVEGOLF_API_KEY`
- **Value**: Paste your LiveGolf API key (from Part 3, Step 1)

### 5. Deploy!
1. Click "Deploy"
2. Wait 2-3 minutes
3. You'll see "Congratulations!" when it's done
4. Click "Continue to Dashboard"
5. Click the screenshot of your app or the "Visit" button
6. Your app is now LIVE! 🎉

### 6. Update Supabase with Your Vercel URL
1. Copy your Vercel app URL (it looks like: `https://golf-pickem.vercel.app`)
2. Go back to your Supabase dashboard
3. Click "Authentication" in the left sidebar
4. Click "URL Configuration"
5. Under "Site URL", paste your Vercel URL
6. Under "Redirect URLs", add: `https://your-app-name.vercel.app/**`
7. Click "Save"

## Part 5: Invite Your Friends

### 1. Share the App
1. Copy your Vercel app URL
2. Send it to your 5 friends

### 2. Have Everyone Sign Up
Each person (including you) needs to:
1. Go to the app URL
2. Click "Don't have an account? Sign up"
3. Enter their email and create a password
4. Check their email for a confirmation link
5. Click the confirmation link
6. Sign in to the app

### 3. Update Usernames (Important!)
After everyone has signed up:
1. Go to your Supabase dashboard
2. Click "Table Editor" in the left sidebar
3. Click the "profiles" table
4. Click on each row (user) and update the "username" field
   - Change from email to a friendly name like "Mike", "Sarah", etc.
5. Do the same for the "season_standings" table

## Part 6: Start Using the App!

### Weekly Routine

**Before Each Tournament (Thursday):**
1. Everyone logs into the app
2. The current PGA Tour event loads automatically
3. Go to the "Draft" tab
4. Draft 4 golfers each (in order shown)
5. Wait for your turn, click a player to draft them

**During the Tournament:**
1. Check the "Leaderboard" tab to see live scores
2. Updates automatically every 2 minutes
3. Watch your players compete!

**After the Tournament:**
1. Check "Standings" to see:
   - Season totals
   - Individual tournament results

## Common Questions

**Q: What if I make a mistake during setup?**
A: No problem! You can:
- Update environment variables in Vercel → Settings → Environment Variables
- Redeploy by going to Vercel → Deployments → click the ... menu → Redeploy

**Q: How much does this cost?**
A: $0! Everything uses free tiers:
- GitHub: Free
- Supabase: Free (up to 500MB database)
- Vercel: Free (unlimited for personal use)
- LiveGolf API: Free

**Q: What if something doesn't work?**
A: Check these things:
1. All 6 people signed up and confirmed emails?
2. Environment variables set correctly in Vercel?
3. Database schema ran successfully in Supabase?
4. Check browser console (press F12) for errors

**Q: Can I customize it?**
A: Yes! But you'll need to learn some coding. Start with:
- Colors: Search for color codes in the files (like `emerald-600`)
- Text: Change any text you see in the component files

**Q: How do I update the app later?**
A: If I give you updates:
1. Go to your GitHub repository
2. Upload the new/updated files
3. Vercel will automatically redeploy (takes 2-3 minutes)

## Need Help?

If you get stuck:
1. Read the error message carefully
2. Check the main README.md file
3. Make sure all steps were followed exactly
4. Double-check your API keys are copied correctly (no extra spaces!)

## You're Done! 🎉

Your Golf Pick'em league is ready to go. Share the app URL with your friends and start drafting!

The app will:
- ✅ Automatically load each week's tournament
- ✅ Update leaderboards in real-time
- ✅ Calculate prize money automatically
- ✅ Keep season-long standings
- ✅ Adjust draft order based on standings

No manual work needed! Just draft and enjoy the competition all season long.

Good luck! 🏌️‍♂️
