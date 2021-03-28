/*

*/

require('dotenv').config();

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');

const storage = require('./src/storage');
const twitchRequest = require('./src/twitch-request');
const pubsub = require('./src/pubsub');
const RewardExistsError = require('./src/errors/reward-exists');
const UnauthorizedError = require('./src/errors/unauthorized');

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

//console.log({ Authorization: 'Basic ' + (Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64')) })

app.get('/login', (req, res) => {
	//const open = require('open');
	//open(twitchRequest.authorizeUrl);
});

app.get('/auth/callback', async (req, res) => {
	try {

		await twitchRequest.authorize(req.query.code, req.query.state);
		console.log('authenticated');
		const authenticated = twitchRequest.getAuthenticated();

		res.status(200).send('Twitch API authenticated.  You can close this browser window/tab.');
	} catch (err) {
		console.error(err);
		res.status(500).send(`An error occured check the server console log`);
	}
});

app.route('/reward')
	.put(handleCreate)
	.delete(handleDelete);

app.listen(port, () => {
	console.log(`App listening on port ${port}`);
	//const open = require('open');
	//open(twitchRequest.authorizeUrl);

	pubsub.connect();

	storage.queryUserEntries(processUserEntries);
});

/**
 * processes batches of user entries and listens to channels for redemptions
 * 
 * @param {*} param entries and the continuationToken 
 * 
 * @returns true when done
 */
async function processUserEntries({ entries, continuationToken }) {
	try {
		//console.log({ entries });
		if (entries.length === 0) return true;
		const items = entries.map(storage.entityMapUser);

		//console.log({ items });
		const promises = [];

		for (let i = 0; i < items.length; i++) {

			const state = items[i];

			const promise = new Promise((resolve, reject) => {
				state.resolve = resolve;
				state.reject = reject;
				resolve();
			})
				.then(asPromiseWithState(storeToken, state))
				.then(asPromiseWithState(listenToChannel, state))
				.catch(e => e);

			promises.push(promise);
		}

		const results = await Promise.all(promises);
		console.log({ results });

		if (!continuationToken) return true;

		return false;

	} catch (error) { 
		// return a value below?? true to stop false to keep trying
		// do I need a 'retry' attempt amount
		console.error(error);
	}
}

// create/delete for testing without the alexa skill
//
async function handleCreate(req, res) {
	try {
		verifyAuthorization(req.headers);
		const result = await handleCreateRequest(req.body);
		console.log({ result });
		res.status(204).end();
	} catch (error) {
		res.status(errorStatus(error)).json({ reason: error.message });
	}
}

async function handleDelete(req, res) {
	try {
		verifyAuthorization(req.headers);
		const result = await handleDeleteRequest(req.body);
		console.log({ result });
		res.status(204).end();
	} catch (error) {
		res.status(errorStatus(error)).json({ reason: error.message });
	}
}

async function handleDeleteRequest({ channel_id, reward_id }) {

	const state = { channel_id, reward_id };

	const results = await twitchRequest.getCustomRewards(channel_id);

	console.log({ results });

	return new Promise((resolve, reject) => {
		state.resolve = resolve;
		state.reject = reject;
		resolve();
	})
		.then(asPromiseWithState(deleteCustomReward, state))
		.then(asPromiseWithState(queryRedemptionEntites, state))
		.then(asPromiseWithState(deleteRedemptionEntites, state))
		.then(asPromiseWithState(deleteRewardEntity, state))
		.then(asPromiseWithState(unlistenToChannel, state));
}

async function handleCreateRequest({ channel_id, title, prompt, cost }) {

	const state = { channel_id, title, prompt, cost };

	return new Promise((resolve, reject) => {
		state.resolve = resolve;
		state.reject = reject;
		resolve();
	})
		.then(asPromiseWithState(getCustomRewards, state))
		.then(asPromiseWithState(createCustomReward, state))
		.then(asPromiseWithState(insertRewardEntity, state))
		.then(asPromiseWithState(listenToChannel, state));
}
//
// create/delete for testing without the alexa skill

function asPromiseWithState(f, state) {
	return (input_arg) => {
		return new Promise((resolve, reject) => {
			state.resolve = resolve;
			state.reject = reject;
			f(state, input_arg);
		});
	};
}

/**
 * 
 * @param {*} headers response headers
 * 
 * @throws UnauthorizedError
 */
function verifyAuthorization(headers) {
	if (headers['authorization'] !== 'Basic ' + (Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64'))) {
		throw new UnauthorizedError(401, 'Unauthorized');
	}
}

function errorStatus(error) {
	switch (error.name) {
		case 'RewardExistsError': return 500;
		case 'UnauthorizedError': return 401;
		case 'Error': return error.message === 'Unauthorized' ? 401 : 500;
		default: return 500;
	}
}

async function storeToken(state) {
	twitchRequest.storeTokens([{ channel_id: state.channel_id, access_token: state.access_token }]);
	state.resolve();
}

async function listenToChannel(state) {
	return pubsub.listenToChannel(state.channel_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function unlistenToChannel(state) {
	return pubsub.unlistenToChannel(state.channel_id)
		.then(state.resolve)
		.catch(state.reject);
}

async function insertRewardEntity(state, reward) {
	return storage.insertRewardEntity({ channel_id: state.channel_id, reward_id: reward.id, title: reward.title })
		.then(state.resolve)
		.catch(state.reject);
}

async function deleteRewardEntity(state) {
	return storage.deleteRewardEntity(state.channel_id)
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

/**
 * 
 * @param {*} state 
 * @param {*} result 
 * 
 * @throws RewardExistsError
 */
async function createCustomReward(state, result) {
	let reward = result.data ? result.data.find(x => x.title === state.title) : null;

	if (reward) state.reject(new RewardExistsError(reward, `There is a reward with title ${state.title}`));

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