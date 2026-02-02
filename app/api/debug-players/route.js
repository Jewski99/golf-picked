// Debug route to test LiveGolf API response
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  try {
    // First, get events to find the current event
    const eventsResponse = await fetch(
      `https://use.livegolfapi.com/v1/events?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}&tour=pga-tour`
    );
    const eventsData = await eventsResponse.json();

    // If eventId provided, fetch players for that event
    let playersData = null;
    let playersUrl = null;
    if (eventId) {
      playersUrl = `https://use.livegolfapi.com/v1/events/${eventId}/players?api_key=${process.env.NEXT_PUBLIC_LIVEGOLF_API_KEY}`;
      const playersResponse = await fetch(playersUrl);
      playersData = await playersResponse.json();
    }

    return Response.json({
      eventsType: Array.isArray(eventsData) ? 'array' : typeof eventsData,
      eventsCount: Array.isArray(eventsData) ? eventsData.length : 'N/A',
      eventsKeys: Array.isArray(eventsData) ? 'N/A (is array)' : Object.keys(eventsData || {}),
      firstEvent: Array.isArray(eventsData) ? eventsData[0] : null,
      playersUrl,
      playersType: playersData ? (Array.isArray(playersData) ? 'array' : typeof playersData) : null,
      playersCount: playersData && Array.isArray(playersData) ? playersData.length : 'N/A',
      playersKeys: playersData && !Array.isArray(playersData) ? Object.keys(playersData || {}) : 'N/A (is array or null)',
      playersDataSample: playersData ? (Array.isArray(playersData) ? playersData.slice(0, 2) : playersData) : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
