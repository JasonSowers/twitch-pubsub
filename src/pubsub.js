/*

*/

const WebSocket = require('ws');

const fetch = require('node-fetch');

const twitchRequest = require('./twitch-request');

const storage = require('./storage');

const url = 'https://twitch-alexa-skill.azurewebsites.net/api/ProactiveMessage';

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

				try {

					const message = JSON.parse(value.data.message);
					const redemption = message.data.redemption;
					const redemption_id = redemption.id;
					const channel_id = redemption.channel_id;
					const reward_id = redemption.reward.id;
					const username = redemption.user.login;

					if (recentIds.includes(redemption_id)) throw new Error(`Redemption rejected duplicate id: ${redemption_id}`);
					recentIds.push(redemption_id);

					const entityReward = await storage.retrieveRewardEntity(channel_id);
					if (entityReward.response.statusCode !== 200) throw new Error(`Record not found for channel ${channel_id}`);

					const mappedReward = storage.entityMapReward(entityReward.result);
					if (mappedReward.reward_id !== reward_id) throw new Error(`Reward id does not match: current: ${reward_id} stored: ${mappedReward.reward_id}`);

					const sendData = { channel_id, username };

					const options = {
						method: 'POST',
						body: JSON.stringify(sendData)
					};
					const result = await fetch(url, options);

					console.log({ result });

					const storageResult = await storage.insertRedemptionEntity({ channel_id, redemption_id, reward_id });
					console.log({ storageResult });
				} catch (error) {
					console.log(error);
				}

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

async function listenToChannel(channel_id) {
	const store = await twitchRequest.refreshOrValidateStore(channel_id);
	listen(`channel-points-channel-v1.${channel_id}`, store.access_token);
	return `Listening to channel-points-channel-v1.${channel_id}`;
}

async function unlistenToChannel(channel_id) {
	const store = await twitchRequest.refreshOrValidateStore(channel_id);
	unlisten(`channel-points-channel-v1.${channel_id}`, store.access_token);
	return `Stopped tistening to channel-points-channel-v1.${channel_id}`;
}

module.exports = {
	connect,
	listenToChannel,
	unlistenToChannel
};

