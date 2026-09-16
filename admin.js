/* =========================================================
   PLAYFORGE Hub Admin Logic — admin.js
   ========================================================= */

const CONFIG = {
  owner: "PlayforgeStudios0",
  repo: "PLAYFORGE-Hub",
  branch: "main"
};

const $ = (id) => document.getElementById(id);

function log(msg) {
  const box = $("log");
  box.style.display = "block";
  box.textContent += msg + "\n";
  box.scrollTop = box.scrollHeight;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

async function uploadToGitHub(path, base64Content, message, token) {
  const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: message,
      content: base64Content,
      branch: CONFIG.branch
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Failed to commit " + path);
  }
}

$("uploadBtn").addEventListener("click", async () => {
  const token = $("patToken").value.trim();
  const folderName = $("folderName").value.trim();
  const category = $("itemCategory").value;
  
  if (!token) return alert("Please enter your GitHub Personal Access Token.");
  if (!folderName) return alert("Please provide a folder name.");

  const iconFile = $("iconFile").files[0];
  const apkFile = $("apkFile").files[0];
  const shotFiles = Array.from($("shotFiles").files);

  if (!iconFile || !apkFile) return alert("Please select both an icon and an APK file.");

  $("uploadBtn").disabled = true;
  $("log").textContent = "";
  log("Starting deployment...");

  try {
    const targetDir = `${category}/${folderName}`;

    // 1. Upload Screenshots
    const screenshotNames = [];
    for (let i = 0; i < shotFiles.length; i++) {
      const fileName = `shot-${i + 1}.png`;
      log(`Uploading ${fileName}...`);
      const b64 = await fileToBase64(shotFiles[i]);
      await uploadToGitHub(`${targetDir}/${fileName}`, b64, `Add ${fileName}`, token);
      screenshotNames.push(fileName);
    }

    // 2. Upload Icon
    log("Uploading icon.png...");
    const iconB64 = await fileToBase64(iconFile);
    await uploadToGitHub(`${targetDir}/icon.png`, iconB64, "Add icon.png", token);

    // 3. Upload APK
    log(`Uploading ${apkFile.name}...`);
    const apkB64 = await fileToBase64(apkFile);
    await uploadToGitHub(`${targetDir}/${apkFile.name}`, apkB64, `Add ${apkFile.name}`, token);

    // 4. Create and Upload manifest.json
    const manifestData = {
      name: $("appName").value || folderName,
      package: $("packageName").value || `com.playforge.${category === 'games' ? 'cube' : 'breeze'}.${folderName}`,
      version: $("appVersion").value || "1.0.0",
      size: $("appSize").value || "N/A",
      price: parseFloat($("appPrice").value) || 0,
      currency: "USD",
      developer: "Playforge",
      category: category,
      rating: 5.0,
      downloads: 0,
      updated: new Date().toISOString().split('T')[0],
      shortDescription: $("shortDesc").value,
      description: $("fullDesc").value,
      updateNotes: "Initial Release",
      icon: "icon.png",
      screenshots: screenshotNames,
      apk: apkFile.name
    };

    log("Committing manifest.json...");
    const manifestB64 = btoa(unescape(encodeURIComponent(JSON.stringify(manifestData, null, 2))));
    await uploadToGitHub(`${targetDir}/manifest.json`, manifestB64, "Add manifest.json", token);

    log("\nSuccess! Package published to store.");
  } catch (err) {
    log(`\nError: ${err.message}`);
  } finally {
    $("uploadBtn").disabled = false;
  }
});
