const express = require('express');
const app = express();
const path = require('path');
const { port, lofi_playlist_id, my_playlist_id } = require('./environment_variables.json')
const { refresh_tokens, load_tokens } = require('./services/auth_service');
const { get_playlist_track_ids, add_tracks_to_playlist } = require('./services/spotify_service');

const bad_token_status = 401;

const check_ms_interval = 7200000;
//const check_ms_interval = 10000;
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
        .then((token) => { main_flow(token) })
        .catch((err) => { console.error(err); });
    }
});

app.get('*', (req, res) => {
    res.sendStatus(404);
});

server = app.listen(port, async () => {
    console.log(`Web server listening on port ${port}.`);
    refresh_tokens()
    .then((token) => { main_flow(token); })
    .catch((err) => {
        console.error(err);
    });
});

async function main_flow(access_token)
{
    const check_new_songs = async () => {
        const refresh = () => {
            refresh_tokens()
            .then((token) => { main_flow(token); })
            .catch(() => {
                console.error(err);
            });
        };

        console.log('Checking playlist for new content...');
        let tracks = await get_playlist_track_ids(access_token, lofi_playlist_id)
        .catch((err) => {
            if(err.status == bad_token_status) {
                refresh();
            } else {
                console.error(err);
            }
        });

        let cur_tracks = await get_playlist_track_ids(access_token, my_playlist_id)
        .catch((err) => {
            if(err.status == bad_token_status) {
                refresh();
            } else {
                console.error(err);
            }
        });

        let not_intersection = new Set;
        for (let elem of tracks) {
            if (!cur_tracks.has(elem)) {
                not_intersection.add(elem)
            }
        }

        if(not_intersection.size != 0) {
            console.log('Found new tracks! Adding them to your playlist...')
            await add_tracks_to_playlist(access_token, my_playlist_id, not_intersection)
            .catch((err) => {
                if(err.status == bad_token_status) {
                    refresh();
                } else {
                    console.error(err);
                }
            });
        }

        server.close(() => {
            console.log('Web server closed.');
            server = null;

            setTimeout(() => {
                main_flow(access_token);
            }, check_ms_interval);
        });
    }

    if(!server) {
        server = app.listen(port, () => {
            console.log(`Web server listening on port ${port}.`);
            check_new_songs();
        });
    } else {
        check_new_songs();
    }
}