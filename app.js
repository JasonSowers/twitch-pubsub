/*

*/

require('dotenv').config();

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');

const storage = require('./src/storage');
const twitchRequest = require('./src/twitch-request');
const pubsub = require('./src/pubsub');

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

app.get('/login', (req, res) => {
	const open = require('open');
	open(twitchRequest.authorizeUrl);
});

app.get('/auth/callback', async (req, res) => {
	try {

		await storage.connect();

		await twitchRequest.authorize(req.query.code, req.query.state);

		console.log('authenticated');

		pubsub.connect();

		const channel_id = '75987197';
		const authenticated = twitchRequest.getAuthenticated();
		const reward_id = '7e91b9cb-8763-49dd-a3f2-95956159da51';
		//const { refresh_token, reward_id } = await storage.getToken(channel_id);// 'oyxhyos5jb2p54bma5nm3ogwbbgp4vxv6orw86bapcp6vj9hk1';



		// const item = await storage.getChannelItem(channel_id);
		// console.log({ item });
		// if (item.response.statusCode === 404) {
		// 	await storage.insertBroadcaster({ channel_id, refresh_token: authenticated.refresh_token, reward_id });
		// }

		storage.getBroadcasterEntries(async entries => {
			console.log({ entries });
			const payload = entries.map(x => ({
				channel_id: x.RowKey._,
				refresh_token: x.refresh_token._,
				reward_id: x.reward_id._,
				enable_card: x.enable_card._
			}));
			await pubsub.initialRewardsSetup({ payload });
		});

		// const payload = {
		// 	callowcreation: {
		// 		refresh_token: authenticated.refresh_token,
		// 		channel_id: channel_id,
		// 		enable_card: true,
		// 		reward_id: reward_id
		// 	}
		// };

		//await pubsub.initialRewardsSetup({ payload });

		/*const redemptions = await storage.getRedemptions();

		const redemption = redemptions[0];
		if (redemption) {
			const redemption_id = redemption.redemption_id;
			const reward_id = redemption.reward_id;
			const result = await twitchRequest.getCustomRewardRedemption(channel_id, redemption_id, reward_id)
				.catch(e => e);

			const redeemOne = result.data[0];
			if(redeemOne) {
				if (redeemOne.status === 'UNFULFILLED') {
					console.log({ result });
					const redeemResult = await twitchRequest.updateRedemptionStatus(redemption, 'FULFILLED');
					console.log({ redeemResult });
					
					await storage.removeRedemption(redemption);
				} else {
					await storage.removeRedemption(redemption);
				}
			}
		} else {
			console.log('No Redemption');
		}*/

		res.status(200).send('Twitch API authenticated.  You can close this browser window/tab.');
	} catch (err) {
		console.error(err);
		res.status(500).send(`An error occured check the server console log`);
	}
});

app.post('/action/create', async (req, res) => {

	//
	//	confirm auth HERE
	//	or throw error
	//

	try {

		const { channel_id, refresh_token, title, prompt, cost } = req.body;

		const state = { channel_id, title, prompt, cost };

		const result = await new Promise((resolve, reject) => {
			state.resolve = resolve;
			state.reject = reject;
			resolve(refresh_token);
		})
			.then(asPromiseWithState(createTokensIfNeeded, state))
			.then(asPromiseWithState(getCustomRewards, state))
			.then(asPromiseWithState(createCustomReward, state))
			.then(asPromiseWithState(insertBroadcaster, state))
			.then(asPromiseWithState(listenToChannel, state))
			.catch(e => console.log(e));

		console.log({ result });
		res.status(204).end();
	} catch (error) {
		res.status(500).send(error.message);
	}
});

app.post('/action/delete', async (req, res) => {

	const { channel_id, refresh_token, reward_id } = req.body;

	await createTokensIfNeeded(channel_id, refresh_token);

	const store = twitchRequest.getTokenStore(channel_id);
	if (store.authenticated) {
		await twitchRequest.deleteCustomReward(channel_id, reward_id);

		unlisten(`channel-points-channel-v1.${channel_id}`, store.authenticated.access_token);
		console.log(`stopped listening: ${channel_id}`);
	} else {
		console.log({ message: 'Can not delete and unlistenn no access token', channel_id });
	}
});

app.listen(port, () => {
	console.log(`App listening on port ${port}`);
	const open = require('open');
	open(twitchRequest.authorizeUrl);
});

function asPromiseWithState(f, state) {
	return (input_arg) => {
		return new Promise((resolve, reject) => {
			state.resolve = resolve;
			state.reject = reject;
			f(state, input_arg);
		});
	};
}

async function listenToChannel(state) {
	pubsub.listenToChannel(state.channel_id);
}

async function insertBroadcaster(state, reward) {
	const store = twitchRequest.getTokenStore(state.channel_id);
	storage.insertBroadcaster({ channel_id: state.channel_id, refresh_token: store.refresh_token, reward_id: reward.id })
		.catch(e => state.reject(e));
	state.resolve();
}

async function createCustomReward(state, result) {
	let reward = result.data ? result.data.find(x => x.title === state.title) : null;

	if (reward) state.resolve(reward);

	const data = {
		title: state.title,
		cost: state.cost,
		prompt: state.prompt,
		should_redemptions_skip_request_queue: false
	};

	reward = await twitchRequest.createCustomReward(state.channel_id, data)
		.then(({ data }) => data[0])
		.catch(e => state.reject(e));

	state.resolve(reward);
}

async function getCustomRewards(state) {
	const result = await twitchRequest.getCustomRewards(state.channel_id)
		.catch(e => state.reject(e));
	state.resolve(result);
}

async function createTokensIfNeeded(state, refresh_token) {
	const store = twitchRequest.getTokenStore(state.channel_id);
	if (!store) {
		const authenticated = await twitchRequest.refreshAccessToken({
			refresh_token: refresh_token,
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET
		}).catch(e => state.reject(e));
		twitchRequest.storeTokens([{ authenticated, channel_id: state.channel_id }]);
	}
	state.resolve(store.refresh_token);
}
