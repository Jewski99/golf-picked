'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Player {
  id: string;
  name: string;
  country: string;
}

interface DraftPick {
  user_id: string;
  player_id: string;
  player_name: string;
  pick_number: number;
}

export default function DraftRoom({ currentEvent, currentUser }: any) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftOrder, setDraftOrder] = useState<any[]>([]);
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [currentPick, setCurrentPick] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (currentEvent) {
      loadDraft();
      fetchPlayers();
    }
  }, [currentEvent]);

  useEffect(() => {
    if (currentEvent) {
      // Subscribe to draft picks changes
      const channel = supabase
        .channel(`draft-${currentEvent.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'draft_picks',
            filter: `event_id=eq.${currentEvent.id}`,
          },
          () => {
            loadDraft();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentEvent]);

  const loadDraft = async () => {
    try {
      // Get draft order based on season standings (reverse order)
      const { data: standings } = await supabase
        .from('season_standings')
        .select('*')
        .order('total_winnings', { ascending: true });

      setDraftOrder(standings || []);

      // Get existing draft picks for this event
      const { data: picks } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('pick_number');

      setDraftPicks(picks || []);
      setCurrentPick((picks?.length || 0) + 1);
    } catch (error) {
      console.error('Error loading draft:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events/${currentEvent.id}/players?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      setPlayers(data);
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  const makePickIndex = (currentPick - 1) % draftOrder.length;
  const currentDrafter = draftOrder[makePickIndex];
  const isMyTurn = currentDrafter?.user_id === currentUser?.id;
  const myPicks = draftPicks.filter((p) => p.user_id === currentUser?.id);
  const canStillDraft = myPicks.length < 4;

  const draftPlayer = async (player: Player) => {
    if (!isMyTurn || !canStillDraft) return;

    try {
      await supabase.from('draft_picks').insert({
        event_id: currentEvent.id,
        user_id: currentUser.id,
        player_id: player.id,
        player_name: player.name,
        pick_number: currentPick,
      });
    } catch (error) {
      console.error('Error making draft pick:', error);
    }
  };

  const availablePlayers = players.filter(
    (p) => !draftPicks.some((pick) => pick.player_id === p.id)
  );

  const filteredPlayers = availablePlayers.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isDraftComplete = draftPicks.length >= draftOrder.length * 4;

  if (loading) {
    return <div className="text-center text-slate-400 py-8">Loading draft...</div>;
  }

  if (!currentEvent) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-8 text-center">
        <p className="text-slate-400">Select an event to start drafting</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Draft Order & Status */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
          <h3 className="text-xl font-bold text-emerald-400 mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Draft Order
          </h3>
          <div className="space-y-3">
            {draftOrder.map((user, idx) => {
              const userPicks = draftPicks.filter((p) => p.user_id === user.user_id);
              const isCurrent = idx === makePickIndex && !isDraftComplete;
              
              return (
                <div
                  key={user.user_id}
                  className={`p-3 rounded-lg border transition-all ${
                    isCurrent
                      ? 'bg-emerald-600/20 border-emerald-500 shadow-lg shadow-emerald-600/20'
                      : 'bg-slate-800/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{user.username}</span>
                    <span className="text-sm text-slate-400">{userPicks.length}/4</span>
                  </div>
                  {isCurrent && !isDraftComplete && (
                    <div className="mt-2 text-xs text-emerald-400 font-medium">
                      ON THE CLOCK
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {isDraftComplete && (
            <div className="mt-4 p-3 bg-emerald-600/20 border border-emerald-500 rounded-lg text-center">
              <p className="text-emerald-400 font-medium">Draft Complete!</p>
            </div>
          )}
        </div>

        {/* My Picks */}
        <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
          <h3 className="text-xl font-bold text-emerald-400 mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            My Picks ({myPicks.length}/4)
          </h3>
          <div className="space-y-2">
            {myPicks.map((pick, idx) => (
              <div key={idx} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                <div className="font-medium text-white">{pick.player_name}</div>
                <div className="text-xs text-slate-400">Pick #{pick.pick_number}</div>
              </div>
            ))}
            {[...Array(4 - myPicks.length)].map((_, idx) => (
              <div key={`empty-${idx}`} className="p-3 border-2 border-dashed border-slate-700 rounded-lg">
                <div className="text-slate-600 text-sm">Empty slot</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Available Players */}
      <div className="lg:col-span-2">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-emerald-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Available Players
            </h3>
            {isMyTurn && canStillDraft && !isDraftComplete && (
              <span className="px-3 py-1 bg-emerald-600 text-white text-sm font-medium rounded-full animate-pulse">
                Your Turn!
              </span>
            )}
          </div>

          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 mb-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />

          <div className="max-h-[600px] overflow-y-auto space-y-2">
            {filteredPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => draftPlayer(player)}
                disabled={!isMyTurn || !canStillDraft || isDraftComplete}
                className={`w-full p-4 rounded-lg border transition-all text-left ${
                  isMyTurn && canStillDraft && !isDraftComplete
                    ? 'bg-slate-800/50 border-slate-700 hover:bg-emerald-600/20 hover:border-emerald-500 cursor-pointer'
                    : 'bg-slate-800/30 border-slate-700/50 cursor-not-allowed opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">{player.name}</div>
                    <div className="text-sm text-slate-400">{player.country}</div>
                  </div>
                  {isMyTurn && canStillDraft && !isDraftComplete && (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
