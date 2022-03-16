const axios = require('axios').default;
const { response } = require('express');
const { api_base_uri, spotify_item_limit } = require('../spotify_variables.json');
const { max_tries, default_retry_time_s } = require('../environment_variables.json');
const { get_access_token, refresh_tokens } = require("./auth_service");

const spotify_bad_token_status = 401;
const spotify_bad_oath_request_status = 403;
const spotify_rate_limit_exceeded_status = 429;

async function get_playlist_tracks(playlist_id) {
    let tracks = new Set;

    const do_iteration = async (url, tries) => {
        if(tries > max_tries) {
            return null;
        }

        access_token = await get_access_token();

        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch(error) {
            return check_error(error, do_iteration(url, tries+1));
        }

        response.data.items.forEach(element => {
            tracks.add(element.track);
        });

        const next = response.data.next;
        
        if(next) return do_iteration(next, 0);
    
        return tracks;
    }

    return do_iteration(`${api_base_uri}v1/playlists/${playlist_id}/tracks`, 0);
}

async function add_tracks_to_playlist(playlist_id, tracks) {
    let track_list = Array.from(tracks);
    const url = `${api_base_uri}v1/playlists/${playlist_id}/tracks`;

    const do_iteration = async (track_sublist, tries) => {
        if(tries > max_tries) {
            return 1;
        }

        let track_sublist_mutable = track_sublist;
        uris = [];
        for(let i=0;i<spotify_item_limit;i++) {
            let track = track_sublist_mutable.pop();
            if(!track) {
                break;
            }
            uris.push('spotify:track:' + track);
        }
        
        access_token = await get_access_token();
        
        try {
            await axios.post(url, {
                uris
            }, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch(error) {
            return check_error(error, do_iteration(track_sublist, tries+1));
        }
        
        if(track_sublist_mutable.length == 0) {
            return 0;
        } else {
            return do_iteration(track_sublist_mutable, 0);
        }
    }

    return do_iteration(track_list, 0);
}

async function set_playlist_name(playlist_id, new_name) {
    const url = `${api_base_uri}v1/playlists/${playlist_id}`;

    const do_iteration = async (tries) => {
        if(tries > max_tries) {
            return 1;
        }

        access_token = await get_access_token();

        try {
            await axios.put(url, {
                "name": new_name
            }, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch(error) {
            return check_error(error, do_iteration(tries+1));
        }

        return 0;
    }

    return do_iteration(0);
}

async function check_error(error, callback) {
    const retry_after = default_retry_time_s;

    const retry = async (retry_timeout, callback) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(callback());
            }, retry_timeout);
        });
    }

    if(error.response) {
        switch(error.response.status) {
            case spotify_bad_token_status:
                console.log("Bad token, reauthenticating user...");
                await refresh_tokens()
                return callback();
            case spotify_bad_oath_request_status:
                console.error("Bad OAuth request! Are your environment variables set correctly?");
                throw response.error;
            case spotify_rate_limit_exceeded_status:
                retry_after = error.response.headers['Retry-After'] + 1;
                console.log(`Rate limit reached, retrying in ${retry_after} seconds...`);
                return retry(retry_after, callback);
            default:
                console.error("An unknown error was found in Spotify API response!");
                throw response.error;
        }
    } else if(error.request) {
        console.log(`Unable to send request, retrying in ${retry_after} seconds...`)
        return retry(retry_after, callback)
    } else {
        console.error("An unknown error has occurred!");
        throw error.message;
    }
}

module.exports = {
    get_playlist_tracks,
    add_tracks_to_playlist,
    set_playlist_name,
    check_error
}