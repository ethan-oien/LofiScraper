const { promisify } = require('util');
const open = require('open');
const axios = require('axios').default;
const keytar = require('keytar');
const os = require('os');
const { client_id, client_secret, redirect_uri } = require('../environment_variables.json');
const { scopes, authorization_endpoint, token_endpoint } = require('../spotify_variables.json');

const keytarService = 'LofiScraper';
const keytarAccount = os.userInfo().username;

const not_found_status = 404; //used when no refresh token
const conflict_status = 409; //used when state doesn't match

const global_state = generate_state();
let access_token = undefined;

async function get_access_token()
{
    if(!access_token) {
        access_token = await refresh_tokens();
    }

    return access_token;
}

async function refresh_tokens()
{
    token = new Promise(async (resolve, reject) => {
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
            }).catch((err) => {
                reject(err);
            });
        } else {
            construct_url(scopes).then((url) => {
                open(url);
            });

            reject(not_found_status);
        }
    });

    access_token = token;
    return token;
}

async function load_tokens(code, state)
{
    token = new Promise(async (resolve, reject) => {
        const sta = await global_state;
        if(sta != state) {
            logout();
            reject(conflict_status);
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
        }).catch((err) => {
            reject(err);
        });
    });
    
    access_token = token;
    return token;
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
    get_access_token,
    refresh_tokens,
    load_tokens,
    not_found_status,
    conflict_status
}