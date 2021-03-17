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
	//const open = require('open');
	//open(twitchRequest.authorizeUrl);
});

app.get('/auth/callback', async (req, res) => {
	try {

		//await twitchRequest.authorize(req.query.code, req.query.state);

		console.log('authenticated');

		const channel_id = '75987197';
		const authenticated = twitchRequest.getAuthenticated();
		const reward_id = '7e91b9cb-8763-49dd-a3f2-95956159da51';
		//const { refresh_token, reward_id } = await storage.getToken(channel_id);// 'oyxhyos5jb2p54bma5nm3ogwbbgp4vxv6orw86bapcp6vj9hk1';

		const item = await storage.getChannelItem(channel_id);
		console.log({ item });
		if (item.response.statusCode === 404) {
			await storage.insertBroadcasterEntity({ channel_id, refresh_token: authenticated.refresh_token, reward_id });
		}

		res.status(200).send('Twitch API authenticated.  You can close this browser window/tab.');
	} catch (err) {
		console.error(err);
		res.status(500).send(`An error occured check the server console log`);
	}
});

app.post('/action/create', async (req, res) => {

	//
	//	confirm auth HERE client id and secret
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
			.then(asPromiseWithState(insertBroadcasterEntity, state))
			.then(asPromiseWithState(listenToChannel, state))
			.catch(e => {
				console.log(e);
			})
			.finally(v => {
				console.log(v);
			});

		console.log({ result });
		res.status(204).end();
	} catch (error) {
		res.status(500).send(error.message);
	}
});

app.delete('/action/delete', async (req, res) => {

	//
	//	confirm auth HERE client id and secret
	//	or throw error
	//

	try {

		const { channel_id, refresh_token, reward_id } = req.body;

		const state = { channel_id, reward_id };

		const results = await twitchRequest.getCustomRewards(channel_id);

		console.log({ results });

		const result = await new Promise((resolve, reject) => {
			state.resolve = resolve;
			state.reject = reject;
			resolve(refresh_token);
		})
			.then(asPromiseWithState(createTokensIfNeeded, state))
			.then(asPromiseWithState(deleteCustomReward, state))
			.then(asPromiseWithState(queryRedemptionEntites, state))
			.then(asPromiseWithState(deleteRedemptionEntites, state))
			.then(asPromiseWithState(deleteBroadcasterEntity, state))
			.then(asPromiseWithState(unlistenToChannel, state))
			.catch(e => {
				console.log(e);
			})
			.finally(v => {
				console.log(v);
			});

		console.log({ result });
		res.status(204).end();
	} catch (error) {
		res.status(500).send(error.message);
	}
});

app.listen(port, async () => {
	console.log(`App listening on port ${port}`);
	// const open = require('open');
	// open(twitchRequest.authorizeUrl);

	await storage.connect();

	pubsub.connect();

	await new Promise(resolve => {
		storage.queryBroadcasterEntries(async ({ entries, continuationToken }) => {
			console.log({ entries });
			if(entries.length === 0) return resolve();
			const items = entries.map(storage.entityMapBroadcaster);

			console.log({ items });
			const promises = [];

			for (const channel in items) {

				const { refresh_token, channel_id, reward_id } = items[channel];

				const state = { channel_id, reward_id };

				promises.push(new Promise((resolve, reject) => {
					state.resolve = resolve;
					state.reject = reject;
					resolve(refresh_token);
				})
					.then(asPromiseWithState(createTokensIfNeeded, state))
					.then(asPromiseWithState(getCustomRewardCard, state))
					.then(asPromiseWithState(listenToChannel, state))
					.catch(e => {
						console.log(e);
					}))
					.finally(v => {
						console.log(v);
					});
			}

			const results = await Promise.all(promises);
			console.log({ results });

			if (!continuationToken) {
				resolve();
			}
		});
	});

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
	return pubsub.listenToChannel(state.channel_id);
}

async function unlistenToChannel(state) {
	return pubsub.unlistenToChannel(state.channel_id);
}

async function insertBroadcasterEntity(state, reward) {
	const store = twitchRequest.getTokenStore(state.channel_id);
	return storage.insertBroadcasterEntity({ channel_id: state.channel_id, refresh_token: store.refresh_token, reward_id: reward.id })
		.then(state.resolve)
		.catch(state.reject);
}

async function deleteBroadcasterEntity(state) {
	return storage.deleteBroadcasterEntity(state.channel_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function deleteRedemptionEntites(state, redemption_ids) {
	return storage.deleteRedemptionEntites(redemption_ids)
		.then(state.resolve)
		.catch(state.reject);
}

async function queryRedemptionEntites(state) {
	try {
		const redemption_ids = [];
		storage.queryRedemptionEntites(({ entries, continuationToken }) => {
			console.log({ entries });

			const items = entries.map(x => x.RowKey._);
			console.log({ items });

			redemption_ids.push(...items);
			if (!continuationToken) {
				state.resolve(redemption_ids);
			}
		});
	} catch (error) {
		state.reject(error);
	}
}

async function createCustomReward(state, result) {
	let reward = result.data ? result.data.find(x => x.title === state.title) : null;

	if (reward) state.reject(`There is a reward with title ${state.title}`);

	const data = {
		title: state.title,
		cost: state.cost,
		prompt: state.prompt,
		should_redemptions_skip_request_queue: false
	};

	return twitchRequest.createCustomReward(state.channel_id, data)
		.then(({ data }) => state.resolve(data[0]))
		.catch(state.reject);
}

async function deleteCustomReward(state) {
	return twitchRequest.deleteCustomReward(state.channel_id, state.reward_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function getCustomRewards(state) {
	return twitchRequest.getCustomRewards(state.channel_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function getCustomRewardCard(state) {
	return twitchRequest.getCustomRewardCard(state.channel_id, state.reward_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function createTokensIfNeeded(state, refresh_token) {
	const store = twitchRequest.getTokenStore(state.channel_id);
	if (!store) {
		const authenticated = await twitchRequest.refreshAccessToken({
			refresh_token: refresh_token,
			client_id: process.env.CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET
		}).catch(e => {
			state.reject(e);
		});
		twitchRequest.storeTokens([{ authenticated, channel_id: state.channel_id }]);
	}
	state.resolve();
}
