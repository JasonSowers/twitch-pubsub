/*

*/

const WebSocket = require('ws');

const twitchRequest = require('./twitch-request');

const storage = require('./storage');

const recentIds = [];
let pingpongLog = '';

const HEARTBEAT_INTERVAL = 1000 * 60 * 4;//ms between PING's
const MAX_BACKOFF_THRESHOLD_INTERVAL = 1000 * 60 * 2;
const BACKOFF_THRESHOLD_INTERVAL = 1000 * 3; //ms to wait before reconnect

const MAX_PONG_WAIT_INTERVAL = 1000 * 10;

let ws;
let reconnectInterval = BACKOFF_THRESHOLD_INTERVAL;

let pongWaitTimeout = null;
let heartbeatCounter = 0;

// Source: https://www.thepolyglotdeveloper.com/2015/03/create-a-random-nonce-string-using-javascript/
function nonce(length) {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function heartbeat() {
	if (ws.readyState !== WebSocket.OPEN) {
		console.log({ resultText: `heartbeat: ws.readyState === ${ws.readyState}` });
		return;
	}
	if (pongWaitTimeout) {
		console.log({ resultText: `Waiting... sent heartbeat #${heartbeatCounter}` });
		return;
	}

	heartbeatCounter++;

	const message = { type: 'PING' };
	pingpongLog = `SENT #${heartbeatCounter}: ${JSON.stringify(message)}`;
	ws.send(JSON.stringify(message));

	pongWaitTimeout = setTimeout(reconnect, MAX_PONG_WAIT_INTERVAL);
}

function listen(topic, access_token) {
	if (ws.readyState !== WebSocket.OPEN) {
		console.log({ success: true, resultText: `listen: ws.readyState === ${ws.readyState}` });
		return;
	}
	const message = {
		type: 'LISTEN',
		nonce: nonce(15),
		data: {
			topics: [topic],
			auth_token: access_token
		}
	};
	console.log({ success: true, resultText: 'SENT: ' + JSON.stringify(message) });
	ws.send(JSON.stringify(message));
}

function unlisten(topic, access_token) {
	if (ws.readyState !== WebSocket.OPEN) {
		console.log({ success: true, resultText: `unlisten: ws.readyState === ${ws.readyState}` });
		return;
	}
	const message = {
		type: 'UNLISTEN',
		nonce: nonce(15),
		data: {
			topics: [topic],
			auth_token: access_token
		}
	};
	console.log({ success: true, resultText: 'SENT: ' + JSON.stringify(message) });
	ws.send(JSON.stringify(message));
}

function connect() {

	let heartbeatHandle;

	ws = new WebSocket('wss://pubsub-edge.twitch.tv');

	ws.onopen = (event) => {
		console.log({ success: true, resultText: 'INFO: Socket Opened', event });
		heartbeat();
		heartbeatHandle = setInterval(heartbeat, HEARTBEAT_INTERVAL);

		reconnectInterval = BACKOFF_THRESHOLD_INTERVAL;
	};

	ws.onerror = (error) => {
		console.log({ success: false, resultText: `ERR #${heartbeatCounter}`, error });
	};

	ws.onmessage = async (event) => {
		const value = JSON.parse(event.data);
		// console.log({ value });
		switch (value.type) {
			case 'MESSAGE':

				const message = JSON.parse(value.data.message);
				const redemption_id = message.data.redemption.id;
				if (recentIds.includes(redemption_id)) break;
				recentIds.push(redemption_id);
				const channel_id = message.data.redemption.channel_id;
				const reward_id = message.data.redemption.reward.id;

				storage.insertRedemption({ channel_id, redemption_id, reward_id });
				console.log(message.data);
				break;
			case 'PONG':
				console.log({ success: true, resultText: `${pingpongLog} RECV #${heartbeatCounter}: ${JSON.stringify(value)}` });
				clearPongWaitTimeout();
				break;
			case 'RECONNECT':
				reconnect();
				break;
			case 'RESPONSE':
				if (value.error) {
					console.log(value);
				}
				break;
			default:
				console.log({ success: false, resultText: `Unknown state: ${value.type}`, value });
				break;
		}
	};

	ws.onclose = (event) => {
		console.log({ success: false, resultText: 'INFO: Socket Closed', event });
		clearInterval(heartbeatHandle);
		reconnect();
	};
}

function reconnect() {
	if (ws && ws.readyState !== WebSocket.OPEN) {
		ws.close();
	}
	clearPongWaitTimeout();
	console.log({ success: false, resultText: 'INFO: Reconnecting...' });
	reconnectInterval = floorJitterInterval(reconnectInterval * 2);
	if (reconnectInterval > MAX_BACKOFF_THRESHOLD_INTERVAL) {
		reconnectInterval = floorJitterInterval(MAX_BACKOFF_THRESHOLD_INTERVAL);
	}
	setTimeout(connect, reconnectInterval);
}

function floorJitterInterval(interval) {
	return Math.floor(interval + Math.random() * 1000);
}

function clearPongWaitTimeout() {
	if (pongWaitTimeout) {
		clearTimeout(pongWaitTimeout);
		pongWaitTimeout = null;
	}
}

async function updateRewardsSetup({ payload }) {

	const { refresh_token, channel_id, reward_id, enable_card } = payload;

	if (!refresh_token) return;

	const tokenStore = twitchRequest.getTokenStore(channel_id);
	const items = [];
	if (!tokenStore) {
		const authenticated = await twitchRequest.refreshAccessToken({
			refresh_token: refresh_token,
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET
		});
		items.push({ authenticated, channel_id, reward_id, enable_card });
		twitchRequest.storeTokens(items);
	} else {
		items.push({ authenticated: tokenStore, channel_id, reward_id, enable_card });
	}

	await handleChannelPointsCard(items);
}

async function initialRewardsSetup({ payload }) {
	try {

		console.log({ payload });
		const promises = [];

		for (const channel in payload) {

			const { refresh_token, channel_id, reward_id, enable_card } = payload[channel];

			promises.push(new Promise(async resolve => {
				if (refresh_token) {
					const authenticated = await twitchRequest.refreshAccessToken({
						refresh_token: refresh_token,
						client_id: process.env.CLIENT_ID,
						client_secret: process.env.CLIENT_SECRET
					});

					twitchRequest.storeTokens([{ authenticated, channel_id }]);

					const result = await twitchRequest.getCustomRewardCard(channel_id, reward_id)
						.catch(e => console.log(e));

					if (result && result.data) {
						listenToChannel(channel_id);
					}

					resolve({ authenticated, channel_id, reward_id, enable_card });
				} else {
					resolve({ authenticated: null, channel_id, reward_id, enable_card });
				}
			}));
		}
	} catch (error) {
		console.log(error);
	}
}

async function handleChannelPointsCard(items) {
	const cardTitle = 'Alexa Skill';

	for (let i = 0; i < items.length; i++) {
		try {
			const { authenticated, channel_id, enable_card, reward_id } = items[i];

			console.log({ channel_id, enable_card, reward_id });

			if (enable_card === true) {
				await twitchRequest.getCustomRewards(channel_id)
					.then(result => createCustomReward(result, cardTitle, channel_id))
					.then(listenToChannel)
					.catch(e => console.log(e));
			} else {

				if (authenticated) {
					if (enable_card === false) {
						await twitchRequest.deleteCustomReward(channel_id, reward_id);
					}
					unlisten(`channel-points-channel-v1.${channel_id}`, authenticated.access_token);
					console.log(`stopped listening: ${channel_id}`);
				} else {
					console.log({ message: 'Can not unlistenn no access token', channel_id, enable_card, reward_id });
				}
			}
		} catch (error) {
			console.log(items[i]);
			console.error(error);
		}
	}
}

async function createCustomReward(result, cardTitle, channel_id) {

	const reward = result.data ? result.data.find(x => x.title === cardTitle) : null;
	let reward_id = null;

	if (!reward) {
		const data = {
			title: cardTitle,
			cost: 420,
			prompt: `Send this request to the broadcaster`,
			should_redemptions_skip_request_queue: false
		};

		const results = await twitchRequest.createCustomReward(channel_id, data).catch(e => {
			console.log(e);
		});

		if (results) {
			if (results.data) {
				reward_id = results.data[0].id;
			} else if (results.error) {
				console.error(results.error);
			}
		}
	} else {
		reward_id = reward.id;
	}
	return { channel_id };
}

function listenToChannel(channel_id) {

	const store = twitchRequest.tokenOrThrow(channel_id);
	listen(`channel-points-channel-v1.${channel_id}`, store.access_token);

	console.log(`listening: ${channel_id}`);
}

module.exports = {
	connect,
	initialRewardsSetup,
	updateRewardsSetup,
	listenToChannel
};

