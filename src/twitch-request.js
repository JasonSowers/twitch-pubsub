/*

*/

const crypto = require('crypto');
const TwitchOAuth = require('@callowcreation/basic-twitch-oauth');

const HELIX_API_BASE_PATH = 'https://api.twitch.tv/helix';

const buffer = crypto.randomBytes(16);
const state = buffer.toString('hex');

const tokenStore = {};

const twitchOAuth = new TwitchOAuth({
	client_id: process.env.CLIENT_ID,
	client_secret: process.env.CLIENT_SECRET,
	redirect_uri: process.env.CALLBACK_URL,
	scopes: [
		'channel:read:redemptions',
		'channel:manage:redemptions'
	]
}, state);

async function authorize(code, state) {
	twitchOAuth.confirmState(state);
	await twitchOAuth.fetchToken(code);
}

async function getUsersByName(usernames) {
	const params = usernames.map(x => `login=${x}`).join('&');
	return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?${params}`);
}

async function getUsersByIds(user_ids) {
	const params = user_ids.map(x => `id=${x}`);
	return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?${params.join('&')}`);
}

function tokenOrThrow(broadcaster_id) {
	if (!tokenStore[broadcaster_id]) throw new Error(`No access token for ${broadcaster_id} custom rewards`);
	return tokenStore[broadcaster_id];
}

/**
 * throws if the broadcaster_id does not have an access token
 */
async function createCustomReward(broadcaster_id, data) {
	const access_token = await tokenOrThrow(broadcaster_id);

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}`;
	const options = {
		method: 'POST',
		body: JSON.stringify(data)
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}

async function deleteCustomReward(broadcaster_id, reward_id) {
	const access_token = await tokenOrThrow(broadcaster_id);

	const searchParamsEntries = [
		['broadcaster_id', broadcaster_id],
		['id', reward_id],
	];
	const searchParams = new URLSearchParams(searchParamsEntries);
	const urlQuery = searchParams.toString();

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards?${urlQuery}`;
	const options = {
		method: 'DELETE'
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}

async function getCustomRewards(broadcaster_id) {
	const access_token = await tokenOrThrow(broadcaster_id, only_manageable_rewards = false);

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}&only_manageable_rewards=${only_manageable_rewards}`;
	const options = {
		method: 'GET'
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}


async function getCustomRewardCard(broadcaster_id, reward_id) {
	const access_token = await tokenOrThrow(broadcaster_id);

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}&id=${reward_id}`;
	const options = {
		method: 'GET'
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}

async function getCustomRewardRedemption(broadcaster_id, redemption_id, reward_id) {
	const access_token = await tokenOrThrow(broadcaster_id);

	const searchParamsEntries = [
		['broadcaster_id', broadcaster_id],
		['id', redemption_id],
		['reward_id', reward_id]
	];
	const searchParams = new URLSearchParams(searchParamsEntries);
	const urlQuery = searchParams.toString();

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards/redemptions?${urlQuery}`;
	const options = {
		method: 'GET'
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}

// status = FULFILLED or CANCELED
async function updateRedemptionStatus({ broadcaster_id, redemption_id, reward_id }, status) {
	const access_token = await tokenOrThrow(broadcaster_id);

	const searchParamsEntries = [
		['broadcaster_id', broadcaster_id],
		['id', redemption_id],
		['reward_id', reward_id]
	];
	const searchParams = new URLSearchParams(searchParamsEntries);
	const urlQuery = searchParams.toString();

	const url = `${HELIX_API_BASE_PATH}/channel_points/custom_rewards/redemptions?${urlQuery}`;
	const options = {
		method: 'PATCH',
		body: JSON.stringify({ status })
	};
	return twitchOAuth.fetchEndpointWithCredentials(process.env.CLIENT_ID, access_token, url, options);
}

/* User token require ABOVE */

function storeTokens(items) {
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.access_token) {
			tokenStore[item.channel_id] = item.access_token;
		} else {
			delete tokenStore[item.channel_id];
		}
	}
}

function getTokenStore(channelId) {
	return tokenStore[channelId];
}

function fetchRefreshToken() {
	return twitchOAuth.fetchRefreshToken();
}

function getAuthenticated() {
	return twitchOAuth.getAuthenticated();
}

module.exports = {
	authorizeUrl: twitchOAuth.authorizeUrl,
	authorize,
	getAuthenticated,
	fetchRefreshToken,
	getUsersByIds,
	getUsersByName,
	refreshAccessToken,
	storeTokens,
	getTokenStore,
	tokenOrThrow,
	createCustomReward,
	deleteCustomReward,
	getCustomRewards,
	getCustomRewardCard,
	getCustomRewardRedemption,
	updateRedemptionStatus
};