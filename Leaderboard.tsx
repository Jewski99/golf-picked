'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface LeaderboardEntry {
  position: string;
  player: {
    id: string;
    name: string;
  };
  score: {
    total: number;
    today: number;
    thru: string;
  };
  earnings: number;
}

export default function Leaderboard({ currentEvent }: any) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [draftedPlayers, setDraftedPlayers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentEvent) {
      fetchLeaderboard();
      fetchDraftedPlayers();
      
      // Auto-refresh every 2 minutes
      const interval = setInterval(() => {
        fetchLeaderboard();
      }, 120000);

      return () => clearInterval(interval);
    }
  }, [currentEvent]);

  const fetchDraftedPlayers = async () => {
    try {
      const { data } = await supabase
        .from('draft_picks')
        .select('player_id')
        .eq('event_id', currentEvent.id);

      const playerIds = new Set(data?.map((p) => p.player_id) || []);
      setDraftedPlayers(playerIds);
    } catch (error) {
      console.error('Error fetching drafted players:', error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events/${currentEvent.id}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      setLeaderboard(data);
      
      // Update earnings in database
      await updateEarnings(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateEarnings = async (leaderboardData: LeaderboardEntry[]) => {
    try {
      // Update player earnings for drafted players
      const updates = leaderboardData
        .filter((entry) => draftedPlayers.has(entry.player.id))
        .map((entry) => ({
          event_id: currentEvent.id,
          player_id: entry.player.id,
          player_name: entry.player.name,
          position: entry.position,
          score: entry.score.total,
          earnings: entry.earnings,
        }));

      if (updates.length > 0) {
        await supabase.from('player_results').upsert(updates, {
          onConflict: 'event_id,player_id',
        });

        // Recalculate season standings
        await recalculateStandings();
      }
    } catch (error) {
      console.error('Error updating earnings:', error);
    }
  };

  const recalculateStandings = async () => {
    try {
      // Get all draft picks with their results
      const { data: allPicks } = await supabase
        .from('draft_picks')
        .select(`
          user_id,
          player_results!inner(earnings)
        `);

      // Calculate total winnings per user
      const userTotals = (allPicks || []).reduce((acc: any, pick: any) => {
        const userId = pick.user_id;
        const earnings = pick.player_results?.earnings || 0;
        acc[userId] = (acc[userId] || 0) + earnings;
        return acc;
      }, {});

      // Update season standings
      const updates = Object.entries(userTotals).map(([user_id, total_winnings]) => ({
        user_id,
        total_winnings: total_winnings as number,
      }));

      if (updates.length > 0) {
        await supabase.from('season_standings').upsert(updates, {
          onConflict: 'user_id',
        });
      }
    } catch (error) {
      console.error('Error recalculating standings:', error);
    }
  };

  if (loading) {
    return <div className="text-center text-slate-400 py-8">Loading leaderboard...</div>;
  }

  if (!currentEvent) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-8 text-center">
        <p className="text-slate-400">Select an event to view the leaderboard</p>
      </div>
    );
  }

  // Filter to only show drafted players
  const filteredLeaderboard = leaderboard.filter((entry) =>
    draftedPlayers.has(entry.player.id)
  );

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-emerald-500/20">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Live Leaderboard
          </h3>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            Live
          </div>
        </div>
        <p className="text-slate-400 text-sm mt-1">Showing {filteredLeaderboard.length} drafted players</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Pos
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Player
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Score
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Today
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                Thru
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Earnings
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {filteredLeaderboard.map((entry, idx) => (
              <tr
                key={entry.player.id}
                className="hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-white font-medium">{entry.position}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-white font-medium">{entry.player.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`font-bold ${
                    entry.score.total < 0 ? 'text-red-400' : 
                    entry.score.total > 0 ? 'text-white' : 
                    'text-slate-400'
                  }`}>
                    {entry.score.total > 0 ? '+' : ''}{entry.score.total}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span className={`${
                    entry.score.today < 0 ? 'text-red-400' : 
                    entry.score.today > 0 ? 'text-white' : 
                    'text-slate-400'
                  }`}>
                    {entry.score.today > 0 ? '+' : ''}{entry.score.today}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-slate-400">
                  {entry.score.thru}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className="text-emerald-400 font-medium">
                    ${entry.earnings.toLocaleString()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredLeaderboard.length === 0 && (
        <div className="p-8 text-center text-slate-400">
          No drafted players on the leaderboard yet
        </div>
      )}
    </div>
  );
}
