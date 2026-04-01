// JavaScript to handle mouseover and mouseout events
var activeMethodPill = null;
var activeScenePill = null;
var activeModePill = null;
var activeVidID = 0;
var select = false;


var editor = null;

$(document).ready(function () {
    editor = CodeMirror.fromTextArea(document.getElementById("bibtex"), {
        lineNumbers: false,
        lineWrapping: true,
        readOnly: true
    });
    $(function () {
        $('[data-toggle="tooltip"]').tooltip()
    });

    editor.removeTag = CodeMirror.removeTag;
    var cm = $(".CodeMirror");
    cm.editor = editor;
    editor.save();
    editor.setOption("mode", "htmlmixed");


    activeMethodPill = $('.method-pill').filter('.active')[0];
    activeModePill = $('.mode-pill').filter('.active')[0];
    activeScenePill = $('.scene-pill').filter('.active')[0];

    // resizeAndPlay($('#sparsity')[0]);
});

function copyBibtex() {
    if (editor) {
        navigator.clipboard.writeText(editor.getValue());
    }
};

function selectCompVideo(methodPill, scenePill, n_views, modePill) {
    // Your existing logic for video selection
    // var video = document.getElementById("compVideo");
    select = true;

    if (activeMethodPill) {
        activeMethodPill.classList.remove("active");
    }

    if (activeScenePill) {
        activeScenePill.classList.remove("active");
    }

    if (modePill) {
        activeModePill.classList.remove("active");
        modePill.classList.add("active");
        activeModePill = modePill;
    }

    activeMethodPill = methodPill;
    activeScenePill = scenePill;
    scenePill.classList.add("active");
    pill = scenePill.getAttribute("data-value");

    mode = activeModePill.getAttribute("data-value");

    console.log(mode)

    promptTextBox = $('#prompt-box');

    switch (pill) {
        case 'lighthouse':
            promptTextBox.text("Van gogh painting of a lighthouse in the Arctic");
            break;
        case 'arcade':
            promptTextBox.text("Illustration of an arcade room with posters on the walls.");
            break;
        case 'alice':
            promptTextBox.text("Monet painting of Alice in Wonderland, girl, cat flower.");
            break;
        case 'balloons':
            promptTextBox.text("Hot air balloons floating over a stunning desert landscape at sunrise");
            break;
        case 'bear':
            promptTextBox.text("A bear sitting in a classroom with a hat on");
            break;
        case 'bedroom':
            promptTextBox.text("A serene, modern bedroom with a soft white and blush color palette");
            break;
        case 'crabs':
            promptTextBox.text("A mystical beach with large crabs wearing hats");
            break;
        case 'foresthouse':
            promptTextBox.text("Magician's cabin in a tranquil forest, witha flagpole bearing a red flag, beside a flowing river");
            break;
        case 'kitchen':
            promptTextBox.text("A charming stone kitchen");
            break;
        case 'mushroom':
            promptTextBox.text("A whimsical forest clearing with mushroom houses");
            break;
        case 'octobar':
            promptTextBox.text("A galactic saloon with an octopus serving drinks");
            break;
        case 'manor':
            promptTextBox.text("A grand piano sits in a spacious room... painting and vases... charis...");
            break;
        case 'pumpkin':
            promptTextBox.text("Rolling hills with oversized pumpkins and colorful flower fields");
            break;
        case 'peacock':
            promptTextBox.text("A majestic peacock surfing a wave");
            break;
            

    }


    // swap video to avoid flickering
    // activeVidID = 1 - activeVidID;
    var video_active_0 = document.getElementById("compVideo0");
    var video_active_1 = document.getElementById("compVideo1");
    // console.log(activeVidID)
    // var video_hidden = document.getElementById("compVideo" + (1 - activeVidID));

    console.log("HELLO")
    console.log(pill)
    video_active_0.src = "videos/comparisons/ours/" + pill + ".mp4";
    video_active_1.src = "videos/comparisons/" + mode + "/" + pill + ".mp4";
    console.log(video_active_0.src)
    console.log(video_active_1.src)
    video_active_0.load();
    video_active_1.load();
}