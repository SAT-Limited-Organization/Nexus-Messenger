const admin = require('firebase-admin');
const { onValueCreated } = require('firebase-functions/v2/database');
admin.initializeApp();

const sendFcmMessage = async (payload, options) => {
    const apiUrl = `https://fcm.googleapis.com/v1/projects/${process.env.GCLOUD_PROJECT}/messages:send`;
    const accessToken = await getAccessToken();
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`FCM error: ${error.error.message}`);
    }
    return response.json();
};

const getAccessToken = async () => {
    const token = await admin.credential.applicationDefault().getAccessToken();
    return token.access_token;
};

exports.notifyOnNewChatMessage = onValueCreated('/data/chatMessages/{chatId}/messages/{msgId}', async (event) => {
  const chatId = event.params.chatId;
  const msgId = event.params.msgId;
  const msg = event.data.val();
  msg.chatId = chatId;
  msg.msgId = msgId;
  const payload = {
    message: {
      topic: chatId,
      data: { item: JSON.stringify(msg) },
    },
  };
  const options = {
    priority: 'high',
  };
  return sendFcmMessage(payload, options);
});

exports.removeChat = onValueCreated('/data/chats/{chatId}/info/remove', async (event) => {
  const chatId = event.params.chatId;
  const value = event.data.val();
  if (value) {
    const db = admin.database();
    try {
      const usersSnapshot = await db.ref('/data/users').once('value');
      const users = usersSnapshot.val();
      const rets = [];
      for (const userId of Object.keys(users || {})) {
        const user = users[userId];
        if (user.chats && user.chats[chatId]) {
          const refUC = db.ref(`/data/users/${userId}/chats/${chatId}`);
          rets.push(refUC.remove());
        }
      }
      rets.push(db.ref(`/data/chats/${chatId}`).remove());
      rets.push(db.ref(`/data/chatMessages/${chatId}`).remove());
      await Promise.all(rets);
    }
    catch (error) {
      console.error(`Error removing chatId=${chatId}:`, error);
    }
  }
  return null;
});
