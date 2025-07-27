let username = null;
let userId = null;
let users = new Map();
let localStream = null;
let peerConnection = null;
let inCall = false;
let currentCall = null;
let channel = null;

function connect() {
    const name = document.getElementById('username').value.trim();
    if (!name) {
        showError('Veuillez entrer un nom');
        return;
    }

    username = name;
    userId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    channel = new BroadcastChannel('callcenter');
    channel.onmessage = handleMessage;
    
    channel.postMessage({
        type: 'join',
        user: { id: userId, name: username }
    });

    users.set(userId, { id: userId, name: username });
    
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    document.getElementById('currentUser').textContent = username;
    document.getElementById('errorMsg').classList.add('hidden');
    
    updateUsersList();

    setInterval(() => {
        if (channel) {
            channel.postMessage({
                type: 'alive',
                user: { id: userId, name: username }
            });
        }
    }, 3000);
}

function disconnect() {
    if (channel) {
        channel.postMessage({ type: 'leave', userId: userId });
        channel.close();
    }
    
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    users.clear();
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('hidden');
    username = null;
    userId = null;
    inCall = false;
}

function handleMessage(event) {
    const message = event.data;

    if (message.type === 'join' && message.user.id !== userId) {
        users.set(message.user.id, message.user);
        updateUsersList();
        
        channel.postMessage({
            type: 'response',
            user: { id: userId, name: username },
            to: message.user.id
        });
    }
    
    else if (message.type === 'response' && message.user.id !== userId) {
        users.set(message.user.id, message.user);
        updateUsersList();
    }
    
    else if (message.type === 'leave') {
        users.delete(message.userId);
        updateUsersList();
    }
    
    else if (message.type === 'alive' && message.user.id !== userId) {
        users.set(message.user.id, message.user);
        updateUsersList();
    }
    
    else if (message.to === userId) {
        if (message.type === 'call') {
            handleIncomingCall(message);
        } else if (message.type === 'answer') {
            handleAnswer(message);
        } else if (message.type === 'reject') {
            alert('Appel refusé');
            inCall = false;
            updateUsersList();
        } else if (message.type === 'ice') {
            handleIce(message);
        } else if (message.type === 'hangup') {
            hangUp();
        }
    }
}

function showError(message) {
    document.getElementById('errorMsg').textContent = message;
    document.getElementById('errorMsg').classList.remove('hidden');
}

function updateUsersList() {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    
    const otherUsers = Array.from(users.values()).filter(u => u.id !== userId);
    
    if (otherUsers.length === 0) {
        list.innerHTML = '<div style="color: #666;">Aucun utilisateur connecté</div>';
        return;
    }
    
    otherUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.textContent = user.name;
        
        if (!inCall) {
            div.onclick = () => startCall(user.id, user.name);
        }
        
        list.appendChild(div);
    });
}

async function startCall(targetId, targetName) {
    if (inCall) return;
    
    inCall = true;
    currentCall = { userId: targetId, name: targetName };
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
            showVideo();
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                channel.postMessage({
                    type: 'ice',
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid
                    },
                    to: targetId,
                    from: userId
                });
            }
        };
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        channel.postMessage({
            type: 'call',
            offer: offer,
            to: targetId,
            from: userId,
            fromName: username
        });

    } catch (error) {
        alert('Erreur: impossible d\'accéder à la caméra/micro');
        inCall = false;
    }
}

function handleIncomingCall(message) {
    if (inCall) {
        channel.postMessage({
            type: 'reject',
            to: message.from,
            from: userId
        });
        return;
    }
    
    inCall = true;
    currentCall = { 
        userId: message.from, 
        name: message.fromName,
        offer: message.offer 
    };
    
    document.getElementById('callerName').textContent = message.fromName;
    document.getElementById('incomingCall').classList.remove('hidden');
}

async function acceptCall() {
    document.getElementById('incomingCall').classList.add('hidden');
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        
        peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
            showVideo();
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                channel.postMessage({
                    type: 'ice',
                    candidate: {
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid
                    },
                    to: currentCall.userId,
                    from: userId
                });
            }
        };
        
        await peerConnection.setRemoteDescription(currentCall.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        channel.postMessage({
            type: 'answer',
            answer: answer,
            to: currentCall.userId,
            from: userId
        });
        
    } catch (error) {
        alert('Erreur: impossible d\'accéder à la caméra/micro');
        rejectCall();
    }
}

function rejectCall() {
    document.getElementById('incomingCall').classList.add('hidden');
    
    channel.postMessage({
        type: 'reject',
        to: currentCall.userId,
        from: userId
    });
    
    inCall = false;
    currentCall = null;
    updateUsersList();
}

async function handleAnswer(message) {
    await peerConnection.setRemoteDescription(message.answer);
    showVideo();
}

async function handleIce(message) {
    if (peerConnection) {
        const candidate = new RTCIceCandidate(message.candidate);
        await peerConnection.addIceCandidate(candidate);
    }
}

function showVideo() {
    document.getElementById('noCall').classList.add('hidden');
    document.getElementById('videoContainer').classList.remove('hidden');
}

function hangUp() {
    if (currentCall) {
        channel.postMessage({
            type: 'hangup',
            to: currentCall.userId,
            from: userId
        });
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    document.getElementById('videoContainer').classList.add('hidden');
    document.getElementById('noCall').classList.remove('hidden');
    document.getElementById('incomingCall').classList.add('hidden');
    
    inCall = false;
    currentCall = null;
    updateUsersList();
}

window.addEventListener('beforeunload', () => {
    if (channel) {
        channel.postMessage({ type: 'leave', userId: userId });
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
});
