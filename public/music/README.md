# Track files

Drop an audio file here named after the track id and that track plays the
real recording instead of the car's synthesizer. No code change, no
manifest — the player looks for the file once, and falls back quietly if it
is not there.

| File | Track | Present |
| --- | --- | --- |
| `dhading.m4a` | Dhading Jilla Baireni Ghar | yes |
| `deuralidada.m4a` | Deurali Dada | yes |
| `resham.mp3` | Resham Firiri | — |
| `simsime.mp3` | Sim Sime Pani | — |
| `nagdhunga.mp3` | Nagdhunga Bore | — |
| `valley.mp3` | Valley Traffic | — |
| `thankot.mp3` | Thankot Descent | — |

Ids come from `TRACKS` in `lib/music/tracks.ts`. The convention is
`<id>.mp3`; anything else needs a one-line `file:` on the track, which is
how the two `.m4a` files above are picked up. Any format the browser can
decode works.

The two that are present are also the ones **Follow the route** selects —
Dhading Jilla through the Dhading hills, Deurali Dada on the descent from
Thankot — so the real recordings are what you actually hear on the drive.

## Before you add anything

**These files are not committed.** `.gitignore` excludes the audio in this
folder, on purpose:

- **Licensing.** A folk *song* being traditional does not make a *recording*
  of it free — the performance, arrangement and master are separately
  owned. Ripping audio out of YouTube is both infringement and against
  their terms, so that is not the route.
- **Deployment is distribution.** Keeping your own copies of music you own
  on your own machine is one thing; pushing them to a public host is
  publishing them, which is a different thing with different rules.
- **Repo weight.** This project ships no binary assets at all, and six
  minutes of audio is larger than the entire source tree.

Legitimate sources do exist: Creative Commons releases by Nepali artists,
public-domain recordings on archive.org, and anything you have licensed or
recorded yourself.

If you deploy this and want the real songs, the Video tab is the answer —
it streams from YouTube rather than redistributing anything.
