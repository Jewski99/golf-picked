'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function Home() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('draft');
  const [currentEvent, setCurrentEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [draftPicks, setDraftPicks] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
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

  if (!user) {
    return <AuthForm supabase={supabase} />;
  }

  const availablePlayers = players.filter(
    p => !draftPicks.some(pick => pick.player_id === p.id)
  );
  
  const filteredPlayers = availablePlayers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const myPicks = draftPicks.filter(p => p.user_id === user.id);
  const currentPickNum = draftPicks.length + 1;
  const pickIndex = (currentPickNum - 1) % draftOrder.length;
  const currentDrafter = draftOrder[pickIndex];
  const isMyTurn = currentDrafter?.user_id === user.id && myPicks.length < 4;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white' }}>
      {/* Header */}
      <div style={{ background: '#1e293b', padding: '20px', borderBottom: '1px solid #334155' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#10b981' }}>GOLF PICK&apos;EM</h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>2026 PGA Tour Season</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              padding: '8px 16px',
              background: '#334155',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Event Selector */}
      {currentEvent && (
        <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 20px' }}>
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#10b981' }}>{currentEvent.name}</h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
              {currentEvent.location} • {currentEvent.course}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: '10px', background: '#1e293b', padding: '5px', borderRadius: '10px' }}>
          {['draft', 'standings'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '12px',
                background: activeTab === tab ? '#10b981' : 'transparent',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 'bold' : 'normal'
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 20px 40px' }}>
        {activeTab === 'draft' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
            {/* Draft Order */}
            <div>
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#10b981' }}>Draft Order</h3>
                {draftOrder.map((drafter, idx) => {
                  const picks = draftPicks.filter(p => p.user_id === drafter.user_id);
                  const isCurrent = idx === pickIndex && draftPicks.length < draftOrder.length * 4;
                  return (
                    <div
                      key={drafter.user_id}
                      style={{
                        padding: '12px',
                        background: isCurrent ? '#10b98120' : '#0f172a',
                        border: `1px solid ${isCurrent ? '#10b981' : '#334155'}`,
                        borderRadius: '8px',
                        marginBottom: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{drafter.username}</span>
                        <span style={{ color: '#94a3b8' }}>{picks.length}/4</span>
                      </div>
                      {isCurrent && <div style={{ color: '#10b981', fontSize: '12px', marginTop: '5px' }}>ON THE CLOCK</div>}
                    </div>
                  );
                })}
              </div>

              {/* My Picks */}
              <div style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#10b981' }}>My Picks ({myPicks.length}/4)</h3>
                {myPicks.map((pick, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{pick.player_name}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Pick #{pick.pick_number}</div>
                  </div>
                ))}
                {[...Array(4 - myPicks.length)].map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    style={{
                      padding: '12px',
                      border: '2px dashed #334155',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      color: '#475569'
                    }}
                  >
                    Empty slot
                  </div>
                ))}
              </div>
            </div>

            {/* Available Players */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#10b981' }}>Available Players</h3>
                {isMyTurn && <span style={{ background: '#10b981', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '14px' }}>Your Turn!</span>}
              </div>
              <input
                type="text"
                placeholder="Search players..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: 'white',
                  marginBottom: '15px'
                }}
              />
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {filteredPlayers.map(player => (
                  <button
                    key={player.id}
                    onClick={() => draftPlayer(player)}
                    disabled={!isMyTurn}
                    style={{
                      width: '100%',
                      padding: '15px',
                      background: isMyTurn ? '#0f172a' : '#0f172a50',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: 'white',
                      textAlign: 'left',
                      marginBottom: '8px',
                      cursor: isMyTurn ? 'pointer' : 'not-allowed',
                      opacity: isMyTurn ? 1 : 0.5
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                    <div style={{ fontSize: '14px', color: '#94a3b8' }}>{player.country}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Standings
          <div style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#10b981' }}>Season Standings</h3>
            {seasonStandings.map((standing, idx) => (
              <div
                key={standing.user_id}
                style={{
                  padding: '15px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: idx === 0 ? '#fbbf24' : idx === 1 ? '#94a3b8' : idx === 2 ? '#fb923c' : '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{standing.username}</div>
                    <div style={{ color: '#10b981', fontSize: '14px' }}>${standing.total_winnings.toLocaleString()}</div>
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
        setMessage('Check your email for confirmation!');
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
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#1e293b', padding: '40px', borderRadius: '10px', border: '1px solid #334155', maxWidth: '400px', width: '100%' }}>
        <h1 style={{ textAlign: 'center', color: '#10b981', marginBottom: '10px' }}>GOLF PICK&apos;EM</h1>
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', marginBottom: '30px' }}>2026 PGA Tour Season</p>

        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: 'white',
              marginBottom: '12px'
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
              padding: '12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: 'white',
              marginBottom: '12px'
            }}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginBottom: '12px'
            }}
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              width: '100%',
              padding: '8px',
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
          <p style={{ marginTop: '15px', textAlign: 'center', color: message.includes('Check') ? '#10b981' : '#ef4444', fontSize: '14px' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
