const axios = require('axios').default;
const { api_base_uri } = require('../spotify_variables.json');

const rate_limit_exceeded_status = 429;

async function get_playlist_track_ids(access_token, playlist_id) {
    let tracks = new Set;

    const do_iteration = async (url) => {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if(response.error) {
            if(response.error.status == rate_limit_exceeded_status) {
                const retry_after = response.headers['Retry-After'] + 1;
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve(do_iteration(url));
                    }, retry_after);
                });
            } else throw response.error;
        }
    
        response.data.items.forEach(element => {
            tracks.add(element.track.id);
        });

        const next = response.data.next;
        
        if(next) return do_iteration(next);
    
        return tracks;
    }

    return do_iteration(`${api_base_uri}v1/playlists/${playlist_id}/tracks`);
}

async function add_tracks_to_playlist(access_token, playlist_id, tracks) {
    let track_list = Array.from(tracks);

    const do_iteration = async (url, track_sublist) => {
        uris = [];
        for(let i=0;i<100;i++) { //spotify track insertion limit
            let track = track_sublist.pop();
            if(!track) {
                break;
            }
            uris.push('spotify:track:' + track);
        }
        
        const response = await axios.post(url, {
            uris
        }, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if(response.error) {
            if(response.error.status == rate_limit_exceeded_status) {
                const retry_after = response.headers['Retry-After'] + 1;
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve(do_iteration(url));
                    }, retry_after);
                });
            } else throw response.error;
        }
        
        if(track_sublist.length == 0) {
            return;
        } else {
            return do_iteration(url, track_sublist)
        }
    }

    return do_iteration(`${api_base_uri}v1/playlists/${playlist_id}/tracks`, track_list);
}

module.exports = {
    get_playlist_track_ids,
    add_tracks_to_playlist
}