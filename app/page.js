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
      <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#10b981', fontSize: '20px' }}>Loading...</div>
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
    <div style={{ minHeight: '100vh', background: '#1e293b', color: '#ffffff' }}>
      {/* Header */}
      <header style={{ background: '#0f172a', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                Golf Pick&apos;em League
              </h1>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>2026 PGA Tour Season</p>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                padding: '8px 16px',
                background: '#334155',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Event Selector */}
      {currentEvent && (
        <div style={{ maxWidth: '1200px', margin: '16px auto', padding: '0 16px' }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
              {currentEvent.name}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '14px', color: '#ffffff' }}>
              <span>📍 {currentEvent.location}</span>
              <span>⛳ {currentEvent.course}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '16px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
          {['draft', 'leaderboard', 'standings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: activeTab === tab ? '#10b981' : 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                fontSize: '14px'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 32px' }}>
        {activeTab === 'draft' && (
          <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth >= 1024 ? '1fr 2fr' : '1fr', gap: '16px' }}>
            {/* Draft Order */}
            <div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>Draft Order</h3>
                {draftOrder.map((drafter, idx) => {
                  const picks = draftPicks.filter(p => p.user_id === drafter.user_id);
                  const isCurrent = idx === pickIndex && !isDraftComplete;
                  return (
                    <div
                      key={drafter.user_id}
                      style={{
                        padding: '12px',
                        background: isCurrent ? '#065f46' : '#1e293b',
                        border: `1px solid ${isCurrent ? '#10b981' : '#334155'}`,
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500, color: '#ffffff' }}>{drafter.username}</span>
                        <span style={{ fontSize: '14px', color: '#ffffff' }}>{picks.length}/4</span>
                      </div>
                      {isCurrent && (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                          ON THE CLOCK
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* My Picks */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
                  My Picks ({myPicks.length}/4)
                </h3>
                {myPicks.map((pick, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ fontWeight: 500, color: '#ffffff' }}>{pick.player_name}</div>
                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>Pick #{pick.pick_number}</div>
                  </div>
                ))}
                {[...Array(4 - myPicks.length)].map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    style={{
                      padding: '12px',
                      border: '2px dashed #334155',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ color: '#64748b', fontSize: '14px' }}>Empty slot</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Players */}
            <div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>Available Players</h3>
                  {isMyTurn && !isDraftComplete && (
                    <span style={{ padding: '4px 12px', background: '#10b981', color: '#ffffff', fontSize: '14px', fontWeight: 500, borderRadius: '20px' }}>
                      Your Turn!
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <input
                    type="text"
                    placeholder="Type player name to search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: '#1e293b',
                      border: searchTerm ? '2px solid #10b981' : '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '16px',
                      outline: 'none'
                    }}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '4px'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>
                  {searchTerm 
                    ? `${filteredPlayers.length} player${filteredPlayers.length !== 1 ? 's' : ''} found`
                    : `${filteredPlayers.length} players available - start typing to search`
                  }
                </div>
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  {searchTerm && filteredPlayers.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                      No players found matching "{searchTerm}"
                    </div>
                  )}
                  {filteredPlayers.slice(0, searchTerm ? filteredPlayers.length : 20).map(player => (
                    <button
                      key={player.id}
                      onClick={() => {
                        draftPlayer(player);
                        setSearchTerm('');
                      }}
                      disabled={!isMyTurn || isDraftComplete}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        marginBottom: '8px',
                        background: isMyTurn && !isDraftComplete ? (searchTerm ? '#065f4620' : '#1e293b') : '#1e293b80',
                        border: `2px solid ${isMyTurn && !isDraftComplete && searchTerm ? '#10b981' : '#334155'}`,
                        borderRadius: '8px',
                        color: '#ffffff',
                        textAlign: 'left',
                        cursor: isMyTurn && !isDraftComplete ? 'pointer' : 'not-allowed',
                        opacity: isMyTurn && !isDraftComplete ? 1 : 0.5,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (isMyTurn && !isDraftComplete) {
                          e.currentTarget.style.background = '#065f4640';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isMyTurn && !isDraftComplete) {
                          e.currentTarget.style.background = searchTerm ? '#065f4620' : '#1e293b';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '16px', marginBottom: '4px' }}>{player.name}</div>
                      <div style={{ fontSize: '14px', color: '#94a3b8' }}>{player.country}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Live Leaderboard</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>
                Showing {filteredLeaderboard.length} drafted players
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#1e293b' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Pos</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Player</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((entry, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #334155' }}>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>{entry.position}</td>
                      <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>{entry.player?.name}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: entry.score?.total < 0 ? '#f87171' : '#ffffff' }}>
                        {entry.score?.total > 0 ? '+' : ''}{entry.score?.total || 'E'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 500 }}>
                        ${entry.earnings?.toLocaleString() || '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLeaderboard.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                No leaderboard data available yet
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Season Standings</h3>
            {seasonStandings.map((standing, idx) => (
              <div
                key={standing.user_id}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: idx === 0 ? '#78350f40' : '#1e293b',
                  border: `1px solid ${idx === 0 ? '#f59e0b' : '#334155'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: idx === 0 ? '#f59e0b' : '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      color: '#ffffff'
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#ffffff', fontSize: '16px' }}>{standing.username}</div>
                    <div style={{ color: '#10b981', fontWeight: 500, fontSize: '14px' }}>
                      ${standing.total_winnings?.toLocaleString() || '0'}
                    </div>
                  </div>
                </div>
                {idx === 0 && <span style={{ fontSize: '24px' }}>🏆</span>}
              </div>
            ))}
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
    <div style={{ minHeight: '100vh', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '16px', padding: '32px', maxWidth: '400px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>
            Golf Pick&apos;em League
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>2026 PGA Tour Season</p>
        </div>

        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px'
            }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px'
            }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '12px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#10b981',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        </form>

        {message && (
          <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: message.includes('created') ? '#10b981' : '#ef4444' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
