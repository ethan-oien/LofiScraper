const express = require('express');
const app = express();
const path = require('path');
const { sprintf } = require('sprintf-js');
const { port, lofi_playlist_id, my_playlist_id, playlist_name, check_interval_ms,
    max_tries, default_retry_time_s,  } = require('./environment_variables.json')
const { refresh_tokens, load_tokens } = require('./services/auth_service');
const { get_playlist_tracks, add_tracks_to_playlist, set_playlist_name } = require('./services/spotify_service');

let server = null;

app.use(express.static('public'));

app.get('/callback', (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    const state = req.query.state;
    
    if(error) {
        throw(error);
    } else if(!code) {
        res.sendStatus(404);
    } else {
        res.sendFile('/public/callback.html', {
            root: path.join(__dirname)
        });
        load_tokens(code, state)
        .then(() => { main_flow() })
        .catch((err) => { console.error(err); });
    }
});

app.get('*', (req, res) => {
    res.sendStatus(404);
});

function refresh()
{
    const do_iteration = async (tries) => {
        if(tries > max_tries) {
            return 1;
        }

        console.log("Refreshing access token...");
        try {
            refresh_tokens()
            .then(() => { main_flow(); });
            //THIS SHIT DONT WORK
            //GENERAL ERROR CATCHING, DOESNT ACCOUNT FOR NO REFRESH TOKEN
            //THIS SHOULD GO TO LOAD TOKENS INSTEAD OF RETRYING
        } catch(err) {
            retry = async () => new Promise((resolve, reject) => {
                setTimeout(() => {
                    resolve(do_iteration(tries+1));
                }, default_retry_time_s);
            });

            const status = await retry();

            if(status != 0) console.error(err);
            
            return 0;
        };
    }

    do_iteration(0);
};

async function main_flow()
{
    const check_new_songs = async () => {
        console.log('Checking playlist for new content...');

        let tracks = await get_playlist_tracks(lofi_playlist_id);
        let cur_tracks = await get_playlist_tracks(my_playlist_id);
        
        let cur_track_ids = new Set;
        for(let elem of cur_tracks) {
            cur_track_ids.add(elem.id);
        }

        let symmetric_difference = new Set;
        for(let elem of tracks) {
            if (!cur_track_ids.has(elem.id)) {
                symmetric_difference.add(elem);
            }
        }

        if(symmetric_difference.size != 0) {
            console.log('Found new tracks! Adding them to your playlist...')

            let new_ids = new Set;
            for(let elem of symmetric_difference) {
                new_ids.add(elem.id);
            }

            const add_ret = await add_tracks_to_playlist(my_playlist_id, new_ids);
            if(add_ret != 0) {
                console.error("There was a problem inserting the tracks into your playlist!");
            }

            let union = new Set(cur_tracks);
            for(let elem of symmetric_difference) {
                union.add(elem);
            }
    
            let total_ms = 0;
            for(let elem of union) {
                total_ms += elem.duration_ms;
            }
            const ms_in_minute = 60000;
            const minutes = total_ms/ms_in_minute;
            const minutes_in_hour = 60;
            const hours = minutes/minutes_in_hour;
    
            const new_name = sprintf(playlist_name, hours);
            const set_ret = await set_playlist_name(my_playlist_id, new_name);
            if(set_ret != 0) {
                console.error("There was a problem setting the new name of the playlist!");
            }
        }

        server.close(() => {
            console.log('Web server closed.');
            server = null;

            setTimeout(() => {
                main_flow();
            }, check_interval_ms);
        });
    }

    const check_error = (err) => {
        if(err.response) {
            if(err.response.status == bad_token_status) {
                refresh();
            } else {
                console.error(err);
            }
        } else {
            console.error(err);
        }
    }

    if(!server) {
        server = app.listen(port, () => {
            console.log(`Web server listening on port ${port}.`);
            check_new_songs()
            .catch((err) => { check_error(err) });
        });
    } else {
        check_new_songs()
        .catch((err) => { check_error(err) });
    }
}

server = app.listen(port, () => {
    console.log(`Web server listening on port ${port}.`);
    refresh();
});