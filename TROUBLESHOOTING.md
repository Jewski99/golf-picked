# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### 🚫 "Invalid API Key" Error

**Problem**: App shows an error about invalid API keys

**Solutions**:
1. Check your Vercel environment variables:
   - Go to Vercel → Your Project → Settings → Environment Variables
   - Make sure all 3 variables are there:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `NEXT_PUBLIC_LIVEGOLF_API_KEY`
   
2. Check for extra spaces:
   - Copy the keys again from their sources
   - Make sure there are no spaces before or after the keys
   
3. Redeploy:
   - After updating environment variables, go to Deployments
   - Click the ... menu on the latest deployment
   - Click "Redeploy"

### 👥 Users Can't Sign Up

**Problem**: Sign up button doesn't work or email confirmation doesn't arrive

**Solutions**:
1. Check Supabase email settings:
   - Go to Supabase → Authentication → Email Templates
   - Make sure email provider is configured
   
2. Check spam folder:
   - Confirmation emails sometimes go to spam
   
3. Check Site URL in Supabase:
   - Go to Authentication → URL Configuration
   - Make sure Site URL matches your Vercel URL exactly
   - Add `https://your-app.vercel.app/**` to Redirect URLs

4. Try a different email provider:
   - Gmail sometimes blocks Supabase emails
   - Try with a different email service

### 🎯 Draft Not Working

**Problem**: Can't draft players or draft order is wrong

**Solutions**:
1. Check that all users are in the database:
   - Go to Supabase → Table Editor → profiles
   - Should see 6 users
   - If not, they need to sign up and confirm email
   
2. Check draft picks table:
   - Go to Supabase → Table Editor → draft_picks
   - See if picks are being recorded
   
3. Check season standings:
   - Go to Supabase → Table Editor → season_standings
   - Make sure all 6 users are there
   - If missing, manually add them:
     ```sql
     INSERT INTO season_standings (user_id, username, total_winnings)
     VALUES ('user-id-here', 'username-here', 0);
     ```

4. Clear and restart:
   - Delete all picks for the current event in draft_picks table
   - Refresh the app
   - Start draft again

### 📊 Leaderboard Not Showing Data

**Problem**: Leaderboard is empty or not updating

**Solutions**:
1. Check if tournament has started:
   - LiveGolf API only has data during active tournaments
   - Check pgatour.com to see if tournament is live
   
2. Check the event selection:
   - Make sure you've selected the current tournament
   - Try selecting a different event and coming back
   
3. Check API response:
   - Open browser console (F12)
   - Go to Network tab
   - Refresh the page
   - Look for requests to livegolfapi.com
   - Check if they're returning data
   
4. Verify drafted players:
   - Make sure you've actually drafted players for this event
   - Go to Draft tab and complete the draft

### 💰 Prize Money Not Updating

**Problem**: Earnings stay at $0 or don't update

**Solutions**:
1. Check player_results table:
   - Go to Supabase → Table Editor → player_results
   - See if data is being saved
   
2. Check if tournament is finished:
   - Prize money is only final after tournament ends
   - During tournament, it shows projected earnings
   
3. Manual refresh:
   - Click on a different tab and back to Leaderboard
   - This triggers a fresh API call
   
4. Check Supabase RLS policies:
   - Go to Authentication → Policies
   - Make sure policies exist for player_results table
   - Should allow INSERT and UPDATE

### 🏆 Standings Not Updating

**Problem**: Season standings don't reflect recent tournament results

**Solutions**:
1. Verify tournament data exists:
   - Check player_results table for recent tournament
   - Data should be there after tournament ends
   
2. Manual calculation:
   - In Supabase, run this SQL:
     ```sql
     -- Recalculate all standings
     WITH user_totals AS (
       SELECT 
         dp.user_id,
         p.username,
         COALESCE(SUM(pr.earnings), 0) as total_winnings
       FROM draft_picks dp
       LEFT JOIN player_results pr 
         ON dp.event_id = pr.event_id 
         AND dp.player_id = pr.player_id
       LEFT JOIN profiles p ON dp.user_id = p.id
       GROUP BY dp.user_id, p.username
     )
     INSERT INTO season_standings (user_id, username, total_winnings)
     SELECT user_id, username, total_winnings FROM user_totals
     ON CONFLICT (user_id) 
     DO UPDATE SET 
       total_winnings = EXCLUDED.total_winnings,
       updated_at = NOW();
     ```

### 🎨 Page Looks Broken

**Problem**: Styling is messed up or page doesn't load correctly

**Solutions**:
1. Clear browser cache:
   - Press Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear cache and cookies
   - Refresh the page
   
2. Check browser console:
   - Press F12
   - Look for red error messages
   - Share the error if you need help
   
3. Try different browser:
   - Chrome, Firefox, Safari, or Edge
   - Sometimes one browser has issues
   
4. Check Vercel deployment:
   - Go to Vercel → Deployments
   - Make sure latest deployment is successful (green checkmark)
   - If failed, check build logs

### 🔄 App Not Deploying on Vercel

**Problem**: Deployment fails or gets stuck

**Solutions**:
1. Check build logs:
   - Go to Vercel → Deployments
   - Click on the failed deployment
   - Read the error log
   
2. Common issues:
   - **Missing environment variables**: Add them in Settings
   - **TypeScript errors**: Check for red squiggly lines in files
   - **Package errors**: Make sure package.json is correct
   
3. Try manual redeploy:
   - Go to Deployments
   - Click ... menu → Redeploy
   
4. Check GitHub connection:
   - Make sure GitHub repository is accessible
   - Check if all files were uploaded

### 📱 Mobile Issues

**Problem**: App doesn't work well on mobile

**Solutions**:
1. Use mobile browser:
   - Chrome or Safari on mobile works best
   
2. Rotate to landscape:
   - Some tables look better in landscape mode
   
3. Zoom out if needed:
   - Pinch to zoom out for better view
   
4. The app is responsive, but some features work better on desktop

## How to Check Browser Console

This is very helpful for debugging:

1. **Chrome/Edge**:
   - Press F12 or Ctrl+Shift+I (Windows)
   - Press Cmd+Option+I (Mac)
   
2. **Firefox**:
   - Press F12 or Ctrl+Shift+I
   
3. **Safari**:
   - Enable developer tools first in Preferences
   - Press Cmd+Option+C

Look for red error messages - these tell you what's wrong!

## How to Check Supabase Logs

1. Go to your Supabase dashboard
2. Click "Logs" in the left sidebar
3. Select "Database Logs" or "API Logs"
4. Look for errors around the time the issue occurred

## How to Check Vercel Logs

1. Go to Vercel dashboard
2. Click on your project
3. Click "Logs" at the top
4. Filter by "Errors" to see only problems

## Still Need Help?

If none of these solutions work:

1. **Take screenshots**:
   - Of the error message
   - Of your browser console (F12)
   - Of relevant Supabase tables

2. **Note what you were doing**:
   - What button did you click?
   - What page were you on?
   - What were you trying to do?

3. **Check the versions**:
   - Make sure you're using the latest code
   - Verify all files were uploaded to GitHub

4. **Start fresh**:
   - As a last resort, you can delete everything and start over
   - It only takes 30-45 minutes to set up from scratch

## Preventive Maintenance

To avoid issues:

1. **Weekly check**:
   - Before each tournament, test the draft
   - Make sure everyone can log in
   
2. **Keep backups**:
   - Supabase has automatic backups
   - You can export data from Table Editor
   
3. **Monitor usage**:
   - Check Supabase dashboard for storage usage
   - Check Vercel dashboard for bandwidth usage
   - You should never come close to limits with 6 users

4. **Update when needed**:
   - If I provide updates, test them first
   - Keep the old version until new one works

## Emergency Reset

If everything is completely broken:

1. **Database reset**:
   ```sql
   -- CAUTION: This deletes ALL data
   TRUNCATE TABLE draft_picks CASCADE;
   TRUNCATE TABLE player_results CASCADE;
   UPDATE season_standings SET total_winnings = 0;
   ```

2. **Redeploy**:
   - In Vercel, redeploy from scratch
   - Make sure environment variables are set

3. **Start over**:
   - Everyone signs up again
   - Begin the season fresh

Remember: Your data is safe in Supabase. Even if the app breaks, your data persists!
