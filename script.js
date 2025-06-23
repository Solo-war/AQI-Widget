const AQI_API_URL = "https://api.waqi.info/feed/A377965/?token=31169b16d5ffa8411b9b415ddf51407b86ea785d";

function getAQIIcon(aqi) {
  if (aqi <= 50) return "icon-0-50-192.png";
  if (aqi <= 100) return "icon-51-100-192.png";
  if (aqi <= 150) return "icon-101-150-192.png";
  if (aqi <= 200) return "icon-151-200-192.png";
  if (aqi <= 300) return "icon-201-300-192.png";
  return "icon-300plus-192.png";
}

fetch(AQI_API_URL)
  .then(res => res.json())
  .then(data => {
    const aqi = data.data.aqi;
    const pm10 = data.data.iaqi.pm10.v;
    const pm25 = data.data.iaqi.pm25.v;
    const loc = data.data.city.location.replace(",", "").split(" ");
    const address = `${loc[2]} ${loc[3]} ${loc[1]}`;

    document.getElementById("aqi-value").textContent = `AQI: ${aqi}`;
    document.getElementById("pm10").textContent = `PM10: ${pm10}`;
    document.getElementById("pm25").textContent = `PM2.5: ${pm25}`;
    document.getElementById("address").textContent = `Адрес: ${address}`;
    document.getElementById("aqi-icon").src = getAQIIcon(aqi);
  })
  .catch(() => {
    document.getElementById("aqi-value").textContent = "Ошибка загрузки";
  });



  document.getElementById("close-btn").addEventListener("click", () => {
    window.electronAPI.closeApp();
  });
  
