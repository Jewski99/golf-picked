'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'dangajewski99@gmail.com';

// Helper functions for fuzzy player name matching
const normalizePlayerName = (name) => {
  if (!name) return '';
  // Remove periods, extra spaces, convert to lowercase
  return name.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
};

const playersMatch = (name1, name2) => {
  if (!name1 || !name2) return false;

  const n1 = normalizePlayerName(name1);
  const n2 = normalizePlayerName(name2);

  // Exact match after normalization
  if (n1 === n2) return true;

  // Check if last name matches (e.g., "Scheffler" in both)
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');
  const lastName1 = parts1[parts1.length - 1];
  const lastName2 = parts2[parts2.length - 1];

  // Last names must match and be longer than 3 chars to avoid false positives
  if (lastName1 === lastName2 && lastName1.length > 3) {
    // Additional check: first initial should match if available
    const firstInitial1 = parts1[0]?.[0];
    const firstInitial2 = parts2[0]?.[0];
    if (firstInitial1 && firstInitial2 && firstInitial1 === firstInitial2) {
      return true;
    }
    // If one name is abbreviated (e.g., "S Scheffler" vs "Scottie Scheffler")
    if (parts1.length === 2 && parts2.length === 2) {
      if (parts1[0].length === 1 || parts2[0].length === 1) {
        return true;
      }
    }
  }

  return false;
};

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
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showAllPlayers, setShowAllPlayers] = useState(true);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMessage, setAdminMessage] = useState({ type: '', text: '' });
  const [adminLoading, setAdminLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [cachedAuthToken, setCachedAuthToken] = useState(null);

  // Admin form state
  const [manualFieldText, setManualFieldText] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [prizeAmount, setPrizeAmount] = useState('');
  const [prizeReason, setPrizeReason] = useState('');
  const [adjustmentHistory, setAdjustmentHistory] = useState([]);

  // Create Supabase client with placeholder values during build/SSR
  // The actual client will be created on the client-side with real env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  const supabase = createClient(supabaseUrl, supabaseKey);

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
      // Check admin status
      checkAdminStatus();
    }
  }, [user]);

  // Check if user is admin and cache auth token
  const checkAdminStatus = async () => {
    if (user?.email === ADMIN_EMAIL) {
      setIsAdmin(true);
      // Pre-cache auth token for fast admin operations
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setCachedAuthToken(session.access_token);
      }
    } else {
      setIsAdmin(false);
    }
  };

  // Get auth token for API calls
  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  // Show admin message with auto-clear
  const showAdminMessage = (type, text) => {
    setAdminMessage({ type, text });
    setTimeout(() => setAdminMessage({ type: '', text: '' }), 5000);
  };

  // Admin: Load manual player field
  const handleLoadManualField = async () => {
    if (!manualFieldText.trim()) {
      showAdminMessage('error', 'Please enter player names');
      return;
    }

    if (!currentEvent?.id) {
      showAdminMessage('error', 'No event selected');
      return;
    }

    // Skip confirmation for now to simplify debugging
    setAdminLoading(true);
    showAdminMessage('', ''); // Clear any previous message

    try {
      console.log('[Admin] Step 1: Getting auth token...');
      const token = await getAuthToken();

      if (!token) {
        console.error('[Admin] No token received');
        showAdminMessage('error', 'No auth token - please sign in again');
        setAdminLoading(false);
        return;
      }
      console.log('[Admin] Step 2: Token received, length:', token.length);

      const players = manualFieldText.split('\n').filter(line => line.trim());
      console.log('[Admin] Step 3: Sending', players.length, 'players to API...');

      // Simple fetch with no abort controller for debugging
      const response = await fetch('/api/admin/load-field', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          eventId: currentEvent.id,
          eventName: currentEvent.name,
          players: players
        })
      });

      console.log('[Admin] Step 4: Response status:', response.status);

      const data = await response.json();
      console.log('[Admin] Step 5: Response data:', data);

      if (response.ok) {
        showAdminMessage('success', data.message || 'Players loaded successfully');
        setManualFieldText('');
        fetchPlayers();
      } else {
        showAdminMessage('error', data.error || `Failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('[Admin] CAUGHT ERROR:', error);
      showAdminMessage('error', `Error: ${error.message}`);
    } finally {
      console.log('[Admin] Step 6: Setting loading to false');
      setAdminLoading(false);
    }
  };

  // Admin: Create manual draft pick
  const handleManualDraftPick = async () => {
    if (!selectedUserId || !selectedPlayerId) {
      showAdminMessage('error', 'Please select a user and player');
      return;
    }

    const selectedUser = seasonStandings.find(s => s.user_id === selectedUserId);
    const selectedPlayerObj = players.find(p => p.id === selectedPlayerId);

    if (!selectedUser || !selectedPlayerObj) {
      showAdminMessage('error', 'Invalid user or player selection');
      return;
    }

    // Use cached token - no async call needed
    if (!cachedAuthToken) {
      showAdminMessage('error', 'Auth token not ready - please refresh page');
      return;
    }

    setAdminLoading(true);

    try {
      const response = await fetch('/api/admin/draft-pick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cachedAuthToken}`
        },
        body: JSON.stringify({
          userId: selectedUserId,
          username: selectedUser.username,
          playerId: selectedPlayerObj.id,
          playerName: selectedPlayerObj.name,
          eventId: currentEvent.id,
          eventName: currentEvent.name
        })
      });

      const data = await response.json();

      if (response.ok) {
        // OPTIMISTIC UI UPDATE - add pick to state immediately
        const newPick = data.pick || {
          id: Date.now(),
          event_id: currentEvent.id,
          user_id: selectedUserId,
          username: selectedUser.username,
          player_id: selectedPlayerObj.id,
          player_name: selectedPlayerObj.name,
          pick_number: draftPicks.length + 1
        };

        setDraftPicks(prev => [...prev, newPick]);
        showAdminMessage('success', `Drafted ${selectedPlayerObj.name} for ${selectedUser.username}`);
        setSelectedUserId('');
        setSelectedPlayerId('');
      } else {
        showAdminMessage('error', data.error || 'Failed to create draft pick');
      }
    } catch (error) {
      console.error('[Admin Draft] Error:', error);
      showAdminMessage('error', error.message);
    } finally {
      setAdminLoading(false);
    }
  };

  // Admin: Adjust prize money
  const handlePrizeAdjustment = async () => {
    if (!selectedUserId || !prizeAmount) {
      showAdminMessage('error', 'Please select a user and enter an amount');
      return;
    }

    const amount = parseFloat(prizeAmount);
    if (isNaN(amount)) {
      showAdminMessage('error', 'Please enter a valid number');
      return;
    }

    const selectedUser = seasonStandings.find(s => s.user_id === selectedUserId);
    if (!selectedUser) {
      showAdminMessage('error', 'Invalid user selection');
      return;
    }

    setConfirmDialog({
      title: 'Confirm Prize Adjustment',
      message: `Are you sure you want to ${amount >= 0 ? 'add' : 'subtract'} $${Math.abs(amount).toLocaleString()} ${amount >= 0 ? 'to' : 'from'} ${selectedUser.username}'s prize money?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setAdminLoading(true);

        try {
          const token = await getAuthToken();

          const response = await fetch('/api/admin/adjust-prize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: selectedUserId,
              username: selectedUser.username,
              amount: amount,
              reason: prizeReason || 'Manual adjustment by commissioner',
              eventId: currentEvent?.id,
              eventName: currentEvent?.name
            })
          });

          const data = await response.json();

          if (response.ok) {
            showAdminMessage('success', data.message);
            setSelectedUserId('');
            setPrizeAmount('');
            setPrizeReason('');
            fetchStandings();
            fetchAdjustmentHistory();
          } else {
            showAdminMessage('error', data.error || 'Failed to adjust prize money');
          }
        } catch (error) {
          showAdminMessage('error', error.message);
        } finally {
          setAdminLoading(false);
        }
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  // Fetch adjustment history
  const fetchAdjustmentHistory = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch('/api/admin/adjust-prize', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAdjustmentHistory(data.adjustments || []);
      }
    } catch (error) {
      console.error('Error fetching adjustment history:', error);
    }
  };

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
      const url = `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`;
      console.log('Fetching events from:', url);

      const response = await fetch(url);
      const data = await response.json();

      console.log('Events API response:', data);
      const now = new Date();
      
      // Filter events - include current and upcoming
      const relevantEvents = data.filter(e => {
        const endDate = new Date(e.endDatetime);
        return endDate >= now;
      });
      
      setEvents(relevantEvents);
      
      if (relevantEvents.length > 0) {
        let selectedEvent = relevantEvents[0];
        
        for (const event of relevantEvents) {
          const startDate = new Date(event.startDatetime);
          const endDate = new Date(event.endDatetime);
          
          // If tournament is currently happening (between start and end), show it
          if (now >= startDate && now <= endDate) {
            selectedEvent = event;
            break;
          }
          
          // If tournament hasn't started yet, this is the next one
          if (now < startDate) {
            selectedEvent = event;
            break;
          }
        }
        
        console.log('Selected event:', selectedEvent);
        setCurrentEvent(selectedEvent);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchPlayers = async () => {
    if (!currentEvent?.id) {
      console.log('No current event selected');
      return;
    }

    try {
      console.log(`Fetching players for: ${currentEvent.name} (ID: ${currentEvent.id})`);

      // First, try to get players from manual_fields table (admin-added players)
      const { data: manualPlayers, error: manualError } = await supabase
        .from('manual_fields')
        .select('*')
        .eq('event_id', currentEvent.id);

      if (!manualError && manualPlayers && manualPlayers.length > 0) {
        console.log(`Found ${manualPlayers.length} players in manual_fields`);
        const playersFromManual = manualPlayers.map(p => ({
          id: p.player_id,
          name: p.player_name,
          country: p.player_country || 'Unknown',
          position: '-',
          score: '-',
          thru: '-'
        }));
        setPlayers(playersFromManual);
        console.log(`✅ Successfully loaded ${playersFromManual.length} players from manual_fields`);
        return;
      }

      if (manualError) {
        console.log('Error fetching manual_fields:', manualError.message);
      }

      // Fallback: Try scraped_fields table
      const { data: scrapedPlayers, error: supabaseError } = await supabase
        .from('scraped_fields')
        .select('*')
        .eq('event_id', currentEvent.id);

      if (!supabaseError && scrapedPlayers && scrapedPlayers.length > 0) {
        console.log(`Found ${scrapedPlayers.length} players in Supabase scraped_fields`);
        const playersFromSupabase = scrapedPlayers.map(p => ({
          id: p.player_pga_id || p.id,
          name: p.player_name,
          country: p.player_country || 'Unknown',
          position: '-',
          score: '-',
          thru: '-'
        }));
        setPlayers(playersFromSupabase);
        console.log(`✅ Successfully loaded ${playersFromSupabase.length} players from Supabase`);
        return;
      }

      console.log('No scraped field data found, trying leaderboard API...');

      // Fallback: Try leaderboard endpoint (only works during live tournaments)
      const leaderboardUrl = `https://use.livegolfapi.com/v1/events/${currentEvent.id}/leaderboard?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`;
      const response = await fetch(leaderboardUrl);

      if (!response.ok) {
        console.log(`Leaderboard endpoint returned ${response.status} - tournament may not have started`);
        setPlayers([]);
        return;
      }

      const leaderboardData = await response.json();

      if (Array.isArray(leaderboardData) && leaderboardData.length > 0) {
        const playersFromLeaderboard = leaderboardData.map(entry => ({
          id: entry.player?.id || entry.playerId || entry.id,
          name: entry.player?.name || entry.playerName || entry.name,
          country: entry.player?.country || entry.country || 'Unknown',
          position: entry.position || '-',
          score: entry.score || '-',
          thru: entry.thru || entry.through || '-'
        }));

        setPlayers(playersFromLeaderboard);
        console.log(`✅ Successfully loaded ${playersFromLeaderboard.length} players from leaderboard`);
      } else {
        setPlayers([]);
      }
    } catch (error) {
      console.error('❌ Error fetching manual players:', error);
      setPlayers([]);
    }
  };

  const fetchLeaderboard = async () => {
    if (!currentEvent?.id) return;

    try {
      console.log('Fetching leaderboard from event endpoint...');

      // Use the event endpoint - it contains leaderboard data
      const url = `https://use.livegolfapi.com/v1/events/${currentEvent.id}?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const eventData = await response.json();
      console.log('Event data received:', eventData);

      // Extract players from the event data - check multiple possible locations
      const players = eventData.players || eventData.leaderboard || eventData.field || [];

      console.log(`✅ Loaded ${players.length} players from leaderboard`);
      setLeaderboard(players);

    } catch (error) {
      console.error('❌ Error fetching leaderboard:', error);
    }
  };

  const fetchDraftPicks = async () => {
    console.log('[fetchDraftPicks] Starting query...');
    const startTime = Date.now();

    const { data, error } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('event_id', currentEvent.id)
      .order('pick_number');

    console.log('[fetchDraftPicks] Query complete in', Date.now() - startTime, 'ms, got', data?.length || 0, 'picks');

    if (error) {
      console.error('[fetchDraftPicks] Error:', error.message);
      return;
    }

    const previousPickCount = draftPicks.length;
    setDraftPicks(data || []);

    // Fire-and-forget notification (don't await - UI already updated)
    if (data && data.length > previousPickCount && data.length < draftOrder.length * 4) {
      const nextPickIndex = data.length % draftOrder.length;
      const nextDrafter = draftOrder[nextPickIndex];

      if (nextDrafter && nextDrafter.user_id !== user?.id) {
        // Send notification without blocking
        sendNotification(nextDrafter, data.length + 1).catch(err =>
          console.error('[fetchDraftPicks] Notification error:', err)
        );
      }
    }
  };

  const sendNotification = async (drafter, pickNumber) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number')
        .eq('id', drafter.user_id)
        .single();

      if (profile?.phone_number) {
        const myPicksCount = draftPicks.filter(p => p.user_id === drafter.user_id).length;
        
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: profile.phone_number,
            username: drafter.username,
            pickNumber: myPicksCount + 1,
            eventName: currentEvent.name,
          }),
        });
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
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

  const fetchPlayerStats = async (player) => {
    setSelectedPlayer(player);
    setLoadingStats(true);
    
    try {
      // Fetch player's tournament results from LiveGolf API
      const response = await fetch(
        `https://use.livegolfapi.com/v1/players/${player.id}/results?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch player stats');
      }
      
      const results = await response.json();
      
      // Get last 5 tournaments
      const recentResults = results.slice(0, 5);
      
      // Calculate season earnings (all results)
      const seasonEarnings = results.reduce((sum, r) => sum + (r.earnings || 0), 0);
      
      // Find best finish
      let bestFinish = null;
      results.forEach(r => {
        if (r.position && r.position !== 'CUT') {
          const pos = parseInt(r.position.replace(/\D/g, ''));
          if (!bestFinish || pos < bestFinish) {
            bestFinish = pos;
          }
        }
      });
      
      // Get times drafted in this league
      const { data: draftData } = await supabase
        .from('draft_picks')
        .select('*')
        .eq('player_id', player.id);
      
      setPlayerStats({
        recentResults,
        seasonEarnings,
        bestFinish: bestFinish || 'N/A',
        timesDrafted: draftData?.length || 0
      });
      
    } catch (error) {
      console.error('Error fetching player stats:', error);
      setPlayerStats({ error: true });
    } finally {
      setLoadingStats(false);
    }
  };

  const closePlayerModal = () => {
    setSelectedPlayer(null);
    setPlayerStats(null);
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

  // Enrich leaderboard with draft info for highlighting
  const enrichedLeaderboard = leaderboard.map(entry => {
    // Handle various API data structures for player name
    const leaderboardPlayerName = entry.player?.name || entry.name || entry.player_name || '';

    // Find matching draft pick by name (fuzzy matching)
    const matchingPick = draftPicks.find(pick =>
      playersMatch(pick.player_name, leaderboardPlayerName)
    );

    return {
      ...entry,
      draftedBy: matchingPick ? matchingPick.username : null,
      draftedByUserId: matchingPick ? matchingPick.user_id : null,
      isDrafted: !!matchingPick,
      pickNumber: matchingPick?.pick_number
    };
  });

  // Show all players or just drafted ones based on toggle
  const filteredLeaderboard = showAllPlayers
    ? enrichedLeaderboard
    : enrichedLeaderboard.filter(entry => entry.isDrafted);

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
                  {currentEvent.name}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '14px', color: '#ffffff' }}>
                  <span>📍 {currentEvent.location}</span>
                  <span>⛳ {currentEvent.course}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ maxWidth: '1200px', margin: '16px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
          {['draft', 'field', 'leaderboard', 'standings', ...(isAdmin ? ['admin'] : [])].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'admin') {
                  fetchAdjustmentHistory();
                }
              }}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: activeTab === tab ? (tab === 'admin' ? '#dc2626' : '#10b981') : 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                fontSize: '14px'
              }}
            >
              {tab === 'admin' ? 'Admin' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 32px' }}>
        {activeTab === 'field' && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">{currentEvent?.name} Field</h3>
              <p className="text-slate-400 text-sm mt-1">
                {players.length} players in the field
              </p>
            </div>
            <div style={{ padding: '16px' }}>
              {players.length === 0 ? (
                /* Empty State - No players added yet */
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#1e293b',
                  borderRadius: '12px',
                  border: '2px dashed #334155'
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>⛳</div>
                  <h4 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                    No Players Added Yet
                  </h4>
                  <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>
                    The commissioner needs to add players for this tournament via the Admin Panel.
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => setActiveTab('admin')}
                      style={{
                        padding: '10px 20px',
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      Go to Admin Panel
                    </button>
                  )}
                </div>
              ) : (
                /* Players List */
                <>
                  <input
                    type="text"
                    placeholder="Search field..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      marginBottom: '16px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '14px'
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px', maxHeight: '700px', overflowY: 'auto' }}>
                    {players
                      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((player, idx) => {
                        const isDrafted = draftPicks.some(pick => pick.player_id === player.id);
                        return (
                          <button
                            key={player.id}
                            onClick={() => fetchPlayerStats(player)}
                            style={{
                              padding: '12px',
                              background: isDrafted ? '#1e293b50' : '#1e293b',
                          border: `1px solid ${isDrafted ? '#64748b' : '#334155'}`,
                          borderRadius: '8px',
                          opacity: isDrafted ? 0.6 : 1,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#065f4620';
                          e.currentTarget.style.borderColor = '#10b981';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isDrafted ? '#1e293b50' : '#1e293b';
                          e.currentTarget.style.borderColor = isDrafted ? '#64748b' : '#334155';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '15px' }}>{player.name}</div>
                          {isDrafted ? (
                            <span style={{ fontSize: '16px' }}>✓</span>
                          ) : (
                            <span style={{ fontSize: '14px', color: '#10b981' }}>→</span>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: '#94a3b8' }}>{player.country}</div>
                        {isDrafted && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Drafted</div>
                        )}
                      </button>
                    );
                  })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'draft' && (
          <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth >= 1024 ? '1fr 2fr' : '1fr', gap: '16px' }}>
            {/* Draft Order & My Picks Column */}
            <div>
              {/* Draft History Feed */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold', color: '#ffffff' }}>
                  Draft Feed {draftPicks.length > 0 && `(${draftPicks.length}/${draftOrder.length * 4})`}
                </h3>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {draftPicks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '14px' }}>
                      Draft hasn&apos;t started yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
                      {draftPicks.slice().reverse().map((pick, idx) => (
                        <div
                          key={pick.id}
                          style={{
                            padding: '10px 12px',
                            marginBottom: '8px',
                            background: idx === 0 ? '#065f4615' : '#1e293b',
                            border: `1px solid ${idx === 0 ? '#10b981' : '#334155'}`,
                            borderRadius: '6px',
                            borderLeft: idx === 0 ? '3px solid #10b981' : '1px solid #334155'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, letterSpacing: '0.5px' }}>
                              PICK #{pick.pick_number}
                            </span>
                            {idx === 0 && (
                              <span style={{ fontSize: '10px', background: '#10b981', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                LATEST
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '15px', color: '#ffffff', fontWeight: 600, marginBottom: '4px' }}>
                            {pick.player_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                            drafted by <span style={{ color: '#10b981', fontWeight: 500 }}>{pick.username}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Draft Order */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>Live Leaderboard</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#94a3b8' }}>
                    {showAllPlayers
                      ? `Showing all ${filteredLeaderboard.length} players`
                      : `Showing ${filteredLeaderboard.length} drafted players`}
                  </p>
                </div>
                <button
                  onClick={() => setShowAllPlayers(!showAllPlayers)}
                  style={{
                    padding: '8px 16px',
                    background: showAllPlayers ? '#334155' : '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  {showAllPlayers ? 'Show Drafted Only' : 'Show All Players'}
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#1e293b' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Pos</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Player</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Score</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Thru</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: 500, color: '#ffffff', textTransform: 'uppercase' }}>Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((entry, idx) => {
                    // Handle various API data structures
                    const playerName = entry.player?.name || entry.name || entry.player_name || 'Unknown';
                    const position = entry.position || entry.pos || idx + 1;
                    const score = entry.total ?? entry.score?.total ?? entry.toPar ?? null;
                    const thru = entry.thru || entry.score?.thru || entry.holesPlayed || '-';
                    const earnings = entry.earnings || entry.money || entry.prize || 0;

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderTop: '1px solid #334155',
                          background: entry.isDrafted ? '#065f4620' : 'transparent',
                          borderLeft: entry.isDrafted ? '3px solid #10b981' : '3px solid transparent'
                        }}
                      >
                        <td style={{ padding: '12px', color: '#ffffff', fontWeight: 500 }}>{position}</td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#ffffff', fontWeight: 500 }}>{playerName}</span>
                            {entry.isDrafted && (
                              <span style={{ color: '#10b981', fontSize: '14px' }}>
                                ⭐ <span style={{ fontSize: '12px', color: entry.draftedByUserId === user?.id ? '#10b981' : '#94a3b8' }}>({entry.draftedBy})</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: score !== null && score < 0 ? '#f87171' : '#ffffff' }}>
                          {score === null ? 'E' : score > 0 ? `+${score}` : score === 0 ? 'E' : score}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                          {thru}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#10b981', fontWeight: 500 }}>
                          ${typeof earnings === 'number' ? earnings.toLocaleString() : '0'}
                        </td>
                      </tr>
                    );
                  })}
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

        {/* Admin Panel - Only visible to admin */}
        {activeTab === 'admin' && isAdmin && (
          <div>
            {/* Admin Header */}
            <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>
                Commissioner Admin Panel
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#fca5a5' }}>
                Use these tools to manually override league data. All actions are logged for auditing.
              </p>
            </div>

            {/* Admin Message */}
            {adminMessage.text && (
              <div style={{
                padding: '12px 16px',
                marginBottom: '16px',
                background: adminMessage.type === 'success' ? '#065f46' : '#7f1d1d',
                border: `1px solid ${adminMessage.type === 'success' ? '#10b981' : '#dc2626'}`,
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '14px'
              }}>
                {adminMessage.type === 'success' ? '✓ ' : '✗ '}{adminMessage.text}
              </div>
            )}

            {/* Loading Indicator */}
            {adminLoading && (
              <div style={{
                textAlign: 'center',
                padding: '20px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ color: '#10b981', marginBottom: '8px', fontSize: '16px' }}>
                  ⏳ Processing...
                </div>
                <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 12px 0' }}>
                  Check browser console (F12) for detailed progress
                </p>
                <button
                  onClick={() => setAdminLoading(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#7f1d1d',
                    color: '#ffffff',
                    border: '1px solid #dc2626',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel / Reset
                </button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
              {/* Section 1: Manual Player Field Entry */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                  Manual Player Field Entry
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
                  Paste player names (one per line). Format: &quot;Player Name, Country&quot;
                </p>
                <textarea
                  value={manualFieldText}
                  onChange={(e) => setManualFieldText(e.target.value)}
                  placeholder="Scottie Scheffler, USA
Rory McIlroy, NIR
Jon Rahm, ESP"
                  style={{
                    width: '100%',
                    minHeight: '150px',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                />
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleLoadManualField}
                    disabled={adminLoading || !currentEvent}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: adminLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      opacity: adminLoading ? 0.5 : 1
                    }}
                  >
                    Load Players for {currentEvent?.name || 'Current Tournament'}
                  </button>
                </div>
                {manualFieldText && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
                    {manualFieldText.split('\n').filter(l => l.trim()).length} players to add
                  </div>
                )}
              </div>

              {/* Section 2: Manual Draft Pick Entry */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                  Manual Draft Pick Entry
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
                  Create a draft pick on behalf of any user.
                </p>

                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  Select User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Select User --</option>
                  {seasonStandings.map(standing => {
                    const userPicks = draftPicks.filter(p => p.user_id === standing.user_id);
                    return (
                      <option key={standing.user_id} value={standing.user_id}>
                        {standing.username} ({userPicks.length}/4 picks)
                      </option>
                    );
                  })}
                </select>

                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  Select Player
                </label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Select Player --</option>
                  {players
                    .filter(p => !draftPicks.some(pick => pick.player_id === p.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(player => (
                      <option key={player.id} value={player.id}>
                        {player.name} ({player.country})
                      </option>
                    ))}
                </select>

                <button
                  onClick={handleManualDraftPick}
                  disabled={adminLoading || !selectedUserId || !selectedPlayerId}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (adminLoading || !selectedUserId || !selectedPlayerId) ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    opacity: (adminLoading || !selectedUserId || !selectedPlayerId) ? 0.5 : 1
                  }}
                >
                  Add Draft Pick
                </button>
              </div>

              {/* Section 3: Manual Prize Money Override */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                  Manual Prize Money Override
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
                  Add or subtract prize money from a user&apos;s total. Use negative values to subtract.
                </p>

                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  Select User
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Select User --</option>
                  {seasonStandings.map(standing => (
                    <option key={standing.user_id} value={standing.user_id}>
                      {standing.username} (${standing.total_winnings?.toLocaleString() || '0'})
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  Amount (use negative to subtract)
                </label>
                <input
                  type="number"
                  value={prizeAmount}
                  onChange={(e) => setPrizeAmount(e.target.value)}
                  placeholder="e.g., 50000 or -25000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                />

                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#94a3b8' }}>
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={prizeReason}
                  onChange={(e) => setPrizeReason(e.target.value)}
                  placeholder="e.g., Correction for missed payout"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    marginBottom: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '14px'
                  }}
                />

                <button
                  onClick={handlePrizeAdjustment}
                  disabled={adminLoading || !selectedUserId || !prizeAmount}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#f59e0b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (adminLoading || !selectedUserId || !prizeAmount) ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                    opacity: (adminLoading || !selectedUserId || !prizeAmount) ? 0.5 : 1
                  }}
                >
                  Adjust Prize Money
                </button>
              </div>

              {/* Section 4: Current Standings Reference */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                  Current Standings (Reference)
                </h4>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {seasonStandings.map((standing, idx) => (
                    <div
                      key={standing.user_id}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '8px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: '#94a3b8', width: '20px' }}>{idx + 1}.</span>
                        <span style={{ color: '#ffffff' }}>{standing.username}</span>
                      </div>
                      <span style={{ color: '#10b981', fontWeight: 500 }}>
                        ${standing.total_winnings?.toLocaleString() || '0'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 5: Adjustment History */}
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', gridColumn: 'span 2' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
                  Recent Adjustments Log
                </h4>
                {adjustmentHistory.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                    No adjustments recorded yet
                  </p>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155' }}>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>Date</th>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>User</th>
                          <th style={{ padding: '8px', textAlign: 'right', color: '#94a3b8' }}>Amount</th>
                          <th style={{ padding: '8px', textAlign: 'left', color: '#94a3b8' }}>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adjustmentHistory.map((adj, idx) => (
                          <tr key={adj.id || idx} style={{ borderBottom: '1px solid #334155' }}>
                            <td style={{ padding: '8px', color: '#ffffff' }}>
                              {new Date(adj.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '8px', color: '#ffffff' }}>{adj.username}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: adj.amount >= 0 ? '#10b981' : '#ef4444', fontWeight: 500 }}>
                              {adj.amount >= 0 ? '+' : ''}${adj.amount?.toLocaleString()}
                            </td>
                            <td style={{ padding: '8px', color: '#94a3b8' }}>{adj.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player Stats Modal */}
      {selectedPlayer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={closePlayerModal}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid #10b981',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#ffffff' }}>
                    {selectedPlayer.name}
                  </h2>
                  <p style={{ margin: '6px 0 0 0', fontSize: '16px', color: '#94a3b8' }}>
                    {selectedPlayer.country}
                  </p>
                </div>
                <button
                  onClick={closePlayerModal}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '32px',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: '1'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              {loadingStats ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#10b981', fontSize: '16px' }}>
                  Loading stats...
                </div>
              ) : playerStats?.error ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#ef4444', fontSize: '16px' }}>
                  Unable to load player stats
                </div>
              ) : playerStats ? (
                <>
                  {/* Season Summary Cards */}
                  <div style={{ marginBottom: '28px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                      📊 2026 Season
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Season Earnings
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                          ${playerStats.seasonEarnings.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Best Finish
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                          {playerStats.bestFinish === 'N/A' ? 'N/A' : `T${playerStats.bestFinish}`}
                        </div>
                      </div>
                      <div style={{ padding: '16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Times Drafted
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff' }}>
                          {playerStats.timesDrafted}x
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Form */}
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>
                      🔥 Recent Form (Last 5 Events)
                    </h3>
                    {playerStats.recentResults.length > 0 ? (
                      <div>
                        {playerStats.recentResults.map((result, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '14px',
                              background: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '10px',
                              marginBottom: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                              <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', flex: 1, paddingRight: '12px' }}>
                                {result.eventName || 'Tournament'}
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: 'bold', color: result.position ? '#10b981' : '#ef4444', flexShrink: 0 }}>
                                {result.position ? `T${result.position}` : 'CUT'}
                              </div>
                            </div>
                            <div style={{ fontSize: '14px', color: '#10b981', fontWeight: 500 }}>
                              ${(result.earnings || 0).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px 20px', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }}>
                        <div style={{ color: '#64748b', fontSize: '16px' }}>
                          No recent results available
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal */}
      {confirmDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid #f59e0b',
              borderRadius: '16px',
              maxWidth: '400px',
              width: '100%',
              padding: '24px'
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 'bold', color: '#f59e0b' }}>
              {confirmDialog.title}
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '15px', color: '#ffffff', lineHeight: '1.5' }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={confirmDialog.onCancel}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '14px'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
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


