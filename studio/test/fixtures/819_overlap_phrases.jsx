// overlap_phrases.jsx — Place audio phrases on alternating tracks with overlap.
// Source: D:\Videos\2026\CRWN\Reels TikTok Shorts\Hip Hop Industry\Unmixed\New Recording 819 joyce wrice.wav
// Phrases: 46  |  Overlap: 0.42s  |  TL offset: 0.0s
// Tracks: A3 (even-index) / A4 (odd-index)
// Original: 163.94s  |  Timeline: 151.04s  |  Saved: 12.90s

(function () {
    var AUDIO_MEDIATYPE = 2;
    var TICKS_PER_SECOND = 254016000000;

    var audioPath = "D:\\Videos\\2026\\CRWN\\Reels TikTok Shorts\\Hip Hop Industry\\Unmixed\\New Recording 819 joyce wrice.wav";
    var maxTrackNum = 4;

    var phrases = [
        [0.3562, 4.7597, 0.0, 4.4035, 3],
        [4.7597, 13.1933, 3.9835, 12.4171, 4],
        [20.7846, 23.1277, 11.9971, 14.3402, 3],
        [23.3514, 27.4245, 13.9202, 17.9933, 4],
        [28.2407, 31.0425, 17.5733, 20.3751, 3],
        [34.0176, 39.8338, 19.9551, 25.7713, 4],
        [41.2013, 42.9721, 25.8513, 27.6221, 3],
        [43.0584, 46.2609, 27.7021, 30.9046, 4],
        [48.8048, 51.6295, 30.4846, 33.3093, 3],
        [52.1937, 55.8626, 32.8893, 36.5582, 4],
        [56.4513, 58.9658, 36.1382, 38.6527, 3],
        [58.9658, 61.9102, 38.2327, 41.1771, 4],
        [61.9102, 64.1439, 40.7571, 42.9908, 3],
        [65.9077, 71.2979, 42.5708, 47.961, 4],
        [73.4903, 76.0451, 47.541, 50.0958, 3],
        [76.4499, 78.3487, 50.1758, 52.0746, 4],
        [78.474, 80.593, 52.1546, 54.2736, 3],
        [81.8981, 85.2741, 54.3536, 57.7296, 4],
        [87.2374, 89.9479, 57.3096, 60.0201, 3],
        [95.6524, 98.1265, 59.6001, 62.0742, 4],
        [101.6484, 106.7212, 61.6542, 66.727, 3],
        [107.2403, 110.0122, 66.307, 69.0789, 4],
        [112.9754, 119.6142, 68.6589, 75.2977, 3],
        [121.5749, 124.0142, 74.8777, 77.317, 4],
        [124.0203, 126.8232, 76.897, 79.6999, 3],
        [129.2717, 131.9969, 79.2799, 82.0051, 4],
        [137.4972, 139.754, 81.5851, 83.8419, 3],
        [139.754, 141.2809, 83.9219, 85.4488, 4],
        [141.9929, 145.2295, 85.5288, 88.7654, 3],
        [147.7267, 150.5639, 88.3454, 91.1826, 4],
        [150.9753, 152.5392, 91.2626, 92.8265, 3],
        [152.5392, 154.4565, 92.9065, 94.8238, 4],
        [154.4565, 158.6004, 94.9038, 99.0477, 3],
        [160.6613, 164.3962, 98.6277, 102.3626, 4],
        [166.0568, 169.5358, 101.9426, 105.4216, 3],
        [169.6355, 171.4182, 105.5016, 107.2843, 4],
        [171.921, 176.6933, 107.3643, 112.1366, 3],
        [176.6933, 179.1655, 111.7166, 114.1888, 4],
        [179.4603, 182.3486, 113.7688, 116.6571, 3],
        [183.0996, 185.6217, 116.2371, 118.7592, 4],
        [187.1429, 194.1024, 118.3392, 125.2987, 3],
        [197.5124, 203.8113, 124.8787, 131.1776, 4],
        [205.0086, 213.4885, 130.7576, 139.2375, 3],
        [216.8046, 221.5381, 138.8175, 143.551, 4],
        [222.4651, 227.7134, 143.131, 148.3793, 3],
        [228.5545, 231.6325, 147.9593, 151.0373, 4]
    ];

    if (!app.project) { alert("No project open."); return; }
    var project = app.project;
    var seq = project.activeSequence;
    if (!seq) { alert("No active sequence."); return; }

    if (seq.audioTracks.numTracks < maxTrackNum) {
        alert("Active sequence needs at least " + maxTrackNum + " audio tracks.\n" +
              "Currently has " + seq.audioTracks.numTracks + ".\n" +
              "Right-click in the timeline header → Add Tracks.");
        return;
    }

    function findItemByPath(rootBin, targetPath) {
        for (var i = 0; i < rootBin.children.numItems; i++) {
            var child = rootBin.children[i];
            if (child.type === ProjectItemType.CLIP || child.type === ProjectItemType.FILE) {
                try {
                    if (child.getMediaPath && child.getMediaPath() === targetPath) {
                        return child;
                    }
                } catch (e) {}
            } else if (child.type === ProjectItemType.BIN) {
                var found = findItemByPath(child, targetPath);
                if (found) return found;
            }
        }
        return null;
    }

    var importedItem = findItemByPath(project.rootItem, audioPath);
    if (!importedItem) {
        var importOk = project.importFiles([audioPath], false, project.rootItem, false);
        if (!importOk) { alert("Failed to import audio:\n" + audioPath); return; }
        importedItem = findItemByPath(project.rootItem, audioPath);
    }
    if (!importedItem) { alert("Could not locate imported audio item."); return; }

    var placed = 0;
    var failed = 0;
    var failures = [];

    for (var p = 0; p < phrases.length; p++) {
        var srcStart = phrases[p][0];
        var srcEnd = phrases[p][1];
        var tlStart = phrases[p][2];
        var trackNum = phrases[p][4];
        var targetTrack = seq.audioTracks[trackNum - 1];

        // Trim the MASTER item to this phrase's source window (in SECONDS),
        // then overwrite at the absolute timeline tick. setInPoint/setOutPoint
        // are version-safe (seconds, not ticks). overwriteClip does not ripple.
        var tlTicks = Math.round(tlStart * TICKS_PER_SECOND).toString();

        try {
            importedItem.setInPoint(srcStart, AUDIO_MEDIATYPE);
            importedItem.setOutPoint(srcEnd, AUDIO_MEDIATYPE);
        } catch (e) {
            failures.push("setIn/Out p=" + p + ": " + e.toString());
            failed++;
            continue;
        }

        try {
            if (targetTrack.overwriteClip) {
                targetTrack.overwriteClip(importedItem, tlTicks);
            } else {
                targetTrack.insertClip(importedItem, tlTicks);
            }
            placed++;
        } catch (e) {
            failures.push("placeClip p=" + p + " tl=" + tlStart + ": " + e.toString());
            failed++;
        }
    }

    try { importedItem.setInPoint(0, AUDIO_MEDIATYPE); } catch (e) {}

    var msg = "overlap_phrases.jsx complete.\n" +
              "Placed: " + placed + " of " + phrases.length + " on A3/A4\n" +
              "Failed: " + failed + "\n" +
              "Timeline range: 0.00s - " + (0.0 + 151.0373).toFixed(2) + "s\n";
    if (failures.length > 0) {
        msg += "\nFirst failures:\n" + failures.slice(0, 5).join("\n");
    }
    alert(msg);
})();
