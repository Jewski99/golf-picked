'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Home() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('draft');
  const [currentEvent, setCurrentEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [draftPicks, setDraftPicks] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchEvents();
      fetchStandings();
    }
  }, [user]);

  useEffect(() => {
    if (currentEvent) {
      fetchPlayers();
      fetchDraftPicks();
      fetchDraftOrder();
      fetchLeaderboard();
      
      const interval = setInterval(() => {
        fetchLeaderboard();
      }, 120000);
      
      return () => clearInterval(interval);
    }
  }, [currentEvent]);

  const fetchEvents = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
      );
      const data = await response.json();
      const upcoming = data.filter(e => new Date(e.endDatetime) >= new Date());
      setEvents(upcoming);
      if (upcoming.length > 0) {
        setCurrentEvent(upcoming[0]);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
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

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(
        `https://use.livegolfapi.com/v1/events/${currentEvent.id}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  const fetchDraftPicks = async () => {
    const { data } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('event_id', currentEvent.id)
      .order('pick_number');
    setDraftPicks(data || []);
  };

  const fetchDraftOrder = async () => {
    const { data } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: true });
    setDraftOrder(data || []);
  };

  const fetchStandings = async () => {
    const { data } = await supabase
      .from('season_standings')
      .select('*')
      .order('total_winnings', { ascending: false });
    setSeasonStandings(data || []);
  };

  const draftPlayer = async (player) => {
    const myPicks = draftPicks.filter(p => p.user_id === user.id);
    if (myPicks.length >= 4) return;

    const currentPickNum = draftPicks.length + 1;
    const pickIndex = (currentPickNum - 1) % draftOrder.length;
    const currentDrafter = draftOrder[pickIndex];
    
    if (currentDrafter?.user_id !== user.id) return;

    await supabase.from('draft_picks').insert({
      event_id: currentEvent.id,
      event_name: currentEvent.name,
      user_id: user.id,
      username: user.email.split('@')[0],
      player_id: player.id,
      player_name: player.name,
      pick_number: currentPickNum,
    });

    fetchDraftPicks();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-800 flex items-center justify-center">
        <div className="text-emerald-400 text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm supabase={supabase} />;
  }

  const availablePlayers = players.filter(
    p => !draftPicks.some(pick => pick.player_id === p.id)
  );
  
  const filteredPlayers = availablePlayers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const draftedPlayerIds = new Set(draftPicks.map(p => p.player_id));
  const filteredLeaderboard = leaderboard.filter(entry => draftedPlayerIds.has(entry.player?.id));

  const myPicks = draftPicks.filter(p => p.user_id === user.id);
  const currentPickNum = draftPicks.length + 1;
  const pickIndex = (currentPickNum - 1) % draftOrder.length;
  const currentDrafter = draftOrder[pickIndex];
  const isMyTurn = currentDrafter?.user_id === user.id && myPicks.length < 4;
  const isDraftComplete = draftPicks.length >= draftOrder.length * 4;

  return (
    <div className="min-h-screen bg-slate-800">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-emerald-400">
                Golf Pick&apos;em League
              </h1>
              <p className="text-slate-400 text-xs">2026 PGA Tour Season</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Event Selector */}
      {currentEvent && (
        <div className="container mx-auto px-4 py-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-1">
                  {currentEvent.name}
                </h2>
                <div className="flex flex-wrap gap-3 text-sm text-white">
                  <span>📍 {currentEvent.location}</span>
                  <span>⛳ {currentEvent.course}</span>
                </div>
              </div>
              {events.length > 1 && (
                <select
                  value={currentEvent.id}
                  onChange={(e) => setCurrentEvent(events.find(ev => ev.id === e.target.value))}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  {events.map(event => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="container mx-auto px-4 mb-4">
        <div className="flex gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
          {['draft', 'leaderboard', 'standings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-md font-medium transition-all text-sm ${
                activeTab === tab
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 pb-8">
        {activeTab === 'draft' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Draft Order & My Picks */}
            <div className="lg:col-span-1 space-y-4">
              {/* Draft Order */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Draft Order</h3>
                <div className="space-y-2">
                  {draftOrder.map((drafter, idx) => {
                    const picks = draftPicks.filter(p => p.user_id === drafter.user_id);
                    const isCurrent = idx === pickIndex && !isDraftComplete;
                    return (
                      <div
                        key={drafter.user_id}
                        className={`p-3 rounded-lg border transition-all ${
                          isCurrent
                            ? 'bg-emerald-900/30 border-emerald-500'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white text-base">{drafter.username}</span>
                          <span className="text-sm text-white">{picks.length}/4</span>
                        </div>
                        {isCurrent && (
                          <div className="mt-1 text-xs text-emerald-400 font-medium">
                            ON THE CLOCK
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isDraftComplete && (
                  <div className="mt-3 p-3 bg-emerald-900/20 border border-emerald-500 rounded-lg text-center">
                    <p className="text-emerald-400 font-medium text-sm">Draft Complete! 🎉</p>
                  </div>
                )}
              </div>

              {/* My Picks */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">
                  My Picks ({myPicks.length}/4)
                </h3>
                <div className="space-y-2">
                  {myPicks.map((pick, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-800 border border-slate-700 rounded-lg"
                    >
                      <div className="font-medium text-white">{pick.player_name}</div>
                      <div className="text-sm text-slate-300">Pick #{pick.pick_number}</div>
                    </div>
                  ))}
                  {[...Array(4 - myPicks.length)].map((_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="p-3 border-2 border-dashed border-slate-700 rounded-lg"
                    >
                      <div className="text-slate-600 text-sm">Empty slot</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Available Players */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <h3 className="text-lg font-bold text-white">Available Players</h3>
                  {isMyTurn && !isDraftComplete && (
                    <span className="px-3 py-1 bg-emerald-600 text-white text-sm font-medium rounded-full w-fit">
                      Your Turn!
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 mb-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                <div className="max-h-[500px] overflow-y-auto space-y-2">
                  {filteredPlayers.map(player => (
                    <button
                      key={player.id}
                      onClick={() => draftPlayer(player)}
                      disabled={!isMyTurn || isDraftComplete}
                      className={`w-full p-3 rounded-lg border transition-all text-left ${
                        isMyTurn && !isDraftComplete
                          ? 'bg-slate-800 border-slate-700 hover:bg-emerald-900/20 hover:border-emerald-500 cursor-pointer'
                          : 'bg-slate-800/50 border-slate-700 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{player.name}</div>
                          <div className="text-sm text-slate-300">{player.country}</div>
                        </div>
                        {isMyTurn && !isDraftComplete && (
                          <span className="text-emerald-400 text-lg">+</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-white">Live Leaderboard</h3>
                  <p className="text-slate-400 text-sm">
                    Showing {filteredLeaderboard.length} drafted players
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  Live
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase">Pos</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase">Player</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase hidden sm:table-cell">Score</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-white uppercase hidden sm:table-cell">Today</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase">Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredLeaderboard.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-white font-medium">{entry.position}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-white font-medium">{entry.player?.name}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center hidden sm:table-cell">
                        <span className={`font-bold ${
                          entry.score?.total < 0 ? 'text-red-400' :
                          entry.score?.total > 0 ? 'text-white' :
                          'text-white'
                        }`}>
                          {entry.score?.total > 0 ? '+' : ''}{entry.score?.total || 'E'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center hidden sm:table-cell">
                        <span className={` ${
                          entry.score?.today < 0 ? 'text-red-400' :
                          entry.score?.today > 0 ? 'text-white' :
                          'text-white'
                        }`}>
                          {entry.score?.today > 0 ? '+' : ''}{entry.score?.today || 'E'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-emerald-400 font-medium">
                          ${entry.earnings?.toLocaleString() || '0'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLeaderboard.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                No leaderboard data available yet. Check back during the tournament!
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-white mb-1">Season Standings</h3>
              <p className="text-slate-400 text-sm">Total Prize Money - 2026 Season</p>
            </div>
            <div className="space-y-3">
              {seasonStandings.map((standing, idx) => (
                <div
                  key={standing.user_id}
                  className={`p-4 rounded-lg border ${
                    idx === 0
                      ? 'bg-yellow-900/20 border-yellow-600'
                      : idx === 1
                      ? 'bg-slate-700/30 border-slate-500'
                      : idx === 2
                      ? 'bg-orange-900/20 border-orange-600'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0
                            ? 'bg-yellow-600 text-white'
                            : idx === 1
                            ? 'bg-slate-500 text-white'
                            : idx === 2
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-white">{standing.username}</div>
                        <div className="text-emerald-400 font-medium text-sm">
                          ${standing.total_winnings?.toLocaleString() || '0'}
                        </div>
                      </div>
                    </div>
                    {idx === 0 && <span className="text-2xl">🏆</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthForm({ supabase }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage('Account created! You can now sign in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-800 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-emerald-400 mb-2">
            Golf Pick&apos;em League
          </h1>
          <p className="text-slate-400 text-sm">2026 PGA Tour Season</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        </form>

        {message && (
          <p className={`mt-4 text-sm text-center ${message.includes('created') ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
