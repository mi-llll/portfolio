const API_TOKEN = "YOUR_AUDD_API_TOKEN";
const SPOTIFY_CLIENT_ID = "YOUR_SPOTIFY_CLIENT_ID";
const SPOTIFY_CLIENT_SECRET = "YOUR_SPOTIFY_CLIENT_SECRET";

const API_URL = "https://api.audd.io/";

let mediaRecorder;
let audioChunks = [];
let stream;

let audioContext;
let analyser;
let dataArray;
let bufferLength;
let canvas;
let canvasContext;

const recordButton = document.getElementById("record-button");
const statusText = document.getElementById("status");
const resultText = document.getElementById("result");
const albumCover = document.getElementById("album-cover");
const tracklist = document.getElementById("tracklist");
const spotifyPlayer = document.getElementById("spotify-player");

recordButton.addEventListener("click", async () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    await startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  statusText.textContent = "録音中...";

  stream = await navigator.mediaDevices.getUserMedia({
    audio: true
  });

  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, {
      type: "audio/wav"
    });

    audioChunks = [];

    stream.getTracks().forEach((track) => track.stop());

    await sendAudioToApi(audioBlob);

    if (audioContext) {
      audioContext.close();
    }
  };

  mediaRecorder.start();

  setupVisualizer(stream);
}

function stopRecording() {
  statusText.textContent = "録音停止";
  mediaRecorder.stop();
}

async function sendAudioToApi(audioBlob) {
  statusText.textContent = "検索中...";

  const formData = new FormData();
  formData.append("file", audioBlob);
  formData.append("api_token", API_TOKEN);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (result.status === "success" && result.result) {
      const songTitle = result.result.title;
      const artist = result.result.artist;

      resultText.innerHTML =
        `曲名: ${songTitle} アーティスト: ${artist}`;

      fetchSpotifyTrack(songTitle, artist);
    } else {
      resultText.textContent =
        "一致する楽曲が見つかりませんでした。";

      albumCover.style.display = "none";
      tracklist.innerHTML = "";
    }
  } catch (error) {
    resultText.textContent =
      "エラーが発生しました。再試行してください。";

    console.error(error);
  } finally {
    statusText.textContent = "準備完了";
  }
}

async function getSpotifyToken() {
  const response = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          btoa(
            SPOTIFY_CLIENT_ID +
            ":" +
            SPOTIFY_CLIENT_SECRET
          )
      },
      body: "grant_type=client_credentials"
    }
  );

  const data = await response.json();

  return data.access_token;
}

async function fetchSpotifyTrack(songTitle, artist) {
  const token = await getSpotifyToken();

  const searchUrl =
    `https://api.spotify.com/v1/search?q=` +
    `track:${encodeURIComponent(songTitle)}` +
    `%20artist:${encodeURIComponent(artist)}` +
    `&type=track&limit=1`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const searchData = await response.json();

    if (searchData.tracks.items.length > 0) {
      const track = searchData.tracks.items[0];

      spotifyPlayer.src =
        `https://open.spotify.com/embed/track/${track.id}`;

      fetchSpotifyAlbumTracks(track.album.id, token);
    } else {
      resultText.textContent =
        "Spotifyで一致する曲が見つかりませんでした。";
    }
  } catch (error) {
    console.error("Spotify API Error:", error);
  }
}

async function fetchSpotifyAlbumTracks(albumId, token) {
  const response = await fetch(
    `https://api.spotify.com/v1/albums/${albumId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const albumData = await response.json();

  tracklist.innerHTML = "";

  albumData.tracks.items.forEach((track) => {
    const trackItem = document.createElement("li");

    const trackIframe = document.createElement("iframe");

    trackIframe.src =
      `https://open.spotify.com/embed/track/${track.id}`;

    trackIframe.width = "300";
    trackIframe.height = "80";
    trackIframe.frameBorder = "0";
    trackIframe.allow = "encrypted-media";
    trackIframe.classList.add("spotify-player");

    trackItem.appendChild(trackIframe);
    tracklist.appendChild(trackItem);
  });

  const albumCoverUrl = albumData.images[0].url;

  albumCover.src = albumCoverUrl;

  document.body.style.backgroundImage =
    `url(${albumCoverUrl})`;
}

function setupVisualizer(stream) {
  audioContext =
    new (window.AudioContext || window.webkitAudioContext)();

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;

  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  const source =
    audioContext.createMediaStreamSource(stream);

  source.connect(analyser);

  canvas = document.getElementById("visualizer");
  canvasContext = canvas.getContext("2d");

  drawVisualizer();
}

function drawVisualizer() {
  const width = canvas.width;
  const height = canvas.height;

  canvasContext.clearRect(0, 0, width, height);

  function draw() {
    requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);

    canvasContext.fillStyle =
      "rgba(0, 0, 0, 0.5)";

    canvasContext.fillRect(
      0,
      0,
      width,
      height
    );

    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = "rgb(0, 255, 0)";
    canvasContext.beginPath();

    const sliceWidth = width / bufferLength;

    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasContext.lineTo(width, height / 2);
    canvasContext.stroke();
  }

  draw();
}