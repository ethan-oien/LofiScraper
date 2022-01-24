const { promisify } = require('util');
const open = require('open');
const axios = require('axios').default;
const keytar = require('keytar');
const os = require('os');
const { client_id, client_secret } = require('../environment_variables.json');
const { redirect_uri, scopes, authorization_endpoint, token_endpoint } = require('../spotify_variables.json');

const keytarService = 'LofiScraper';
const keytarAccount = os.userInfo().username;

const global_state = generate_state();

async function refresh_tokens()
{
    return new Promise(async (resolve, reject) => {
        const refresh_token = await keytar.getPassword(keytarService, keytarAccount);

        if(refresh_token) {
            const data = {
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
            }
            const urlEncodedData = new URLSearchParams(data).toString();
        
            axios.post(token_endpoint, urlEncodedData, {
                headers: {
                    'Authorization': 'Basic ' + (Buffer.from((client_id + ':' + client_secret)).toString('base64')),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }).then((res) => {
                if(res.status != 200) {
                    logout();
                    reject(res);
                }
        
                resolve(res.data.access_token);
            });
        } else {
            construct_url(scopes).then((url) => {
                open(url);
            });

            reject('No refresh token!');
        }
    });
}

async function load_tokens(code, state)
{
    return new Promise(async (resolve, reject) => {
        const sta = await global_state;
        if(sta != state) {
            logout();
            reject("State does not match!");
        }

        const data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri
        }
        const urlEncodedData = new URLSearchParams(data).toString();

        axios.post(token_endpoint, urlEncodedData, {
            headers: {
                'Authorization': 'Basic ' + (Buffer.from((client_id + ':' + client_secret)).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then((res) => {
            if(res.status != 200) {
                logout();
                reject(res);
            }

            keytar.setPassword(keytarService, keytarAccount, res.data.refresh_token);

            resolve(res.data.access_token);
        });
    });
}

async function logout()
{
    await keytar.deletePassword(keytarService, keytarAccount);
    access_token = null;
}

async function construct_url(scope=null, show_dialog=null)
{
    const sta = await global_state;

    let uri = authorization_endpoint
        + `?client_id=${client_id}`
        + `&response_type=code`
        + `&redirect_uri=${redirect_uri}`
        + `&state=${sta}`;
    if(scope != null) uri += `&scope=${scope}`;
    if(show_dialog != null) uri += `&show_dialog=${show_dialog}`;

    return uri;
}

async function generate_state()
{
    const { randomBytes } = await import('crypto');
    const randomBytesAsync = promisify(randomBytes);

    let state;
    const state_length = 8;

    state = (await randomBytesAsync(state_length)).toString('hex');

    return state;
}

module.exports = {
    refresh_tokens,
    load_tokens
}