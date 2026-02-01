// File: app/api/notify/route.js
// This API route sends SMS notifications via Twilio

export async function POST(request) {
  try {
    const { phoneNumber, username, pickNumber, eventName } = await request.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioNumber) {
      return Response.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    const message = `🏌️ Golf Pick'em: ${username}, it's your turn to draft!\n\nEvent: ${eventName}\nPick: ${pickNumber}/4\n\nDraft now at: ${process.env.NEXT_PUBLIC_SITE_URL || 'your-app.vercel.app'}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phoneNumber,
        From: twilioNumber,
        Body: message,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return Response.json({ success: true, messageSid: data.sid });
    } else {
      console.error('Twilio error:', data);
      return Response.json({ error: data.message }, { status: 400 });
    }

  } catch (error) {
    console.error('Notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
