
let currentConversationId = null;
let isSending = false;
let lastUserMessage = "";

function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

function scrollToBottom() {
  const chatBox = document.getElementById("chat-box");
  chatBox.scrollTop = chatBox.scrollHeight;
}

function formatMarkdown(text) {
  return text
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

async function handleUnauthorized(response) {
  if (response.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

function addMessage(sender, text = "") {
  const chatBox = document.getElementById("chat-box");

  const wrapper = document.createElement("div");
  wrapper.classList.add("message-wrapper");

  const div = document.createElement("div");
  div.classList.add("message", sender);

  if (sender === "bot") {
    div.innerHTML = formatMarkdown(text);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerText = "Copy";

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(div.innerText);
      copyBtn.innerText = "Copied!";
      setTimeout(() => (copyBtn.innerText = "Copy"), 1000);
    };

    wrapper.appendChild(div);
    wrapper.appendChild(copyBtn);
  } else {
    div.textContent = text;
    wrapper.appendChild(div);
  }

  chatBox.appendChild(wrapper);
  scrollToBottom();

  return div;
}

function streamText(element, chunk) {
  const cursor = '<span class="cursor">|</span>';
  element.innerHTML = formatMarkdown(element.textContent + chunk) + cursor;
  scrollToBottom();
}

async function regenerateResponse() {
  if (!lastUserMessage) return;

  document.getElementById("message").value = lastUserMessage;
  sendMessage();
}

function renderConversationList(items) {
  const list = document.getElementById("conversation-list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<div class="empty-history">No chats yet</div>`;
    return;
  }

  items.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "conversation-item";

    if (Number(currentConversationId) === Number(item.id)) {
      btn.classList.add("active");
    }

    btn.innerHTML = `
      <div class="conversation-title">${item.title}</div>
      <div class="conversation-preview">${item.last_message || "No messages yet"}</div>
      <div class="conversation-date">${item.created_at}</div>
    `;

    btn.onclick = async () => {
      currentConversationId = item.id;
      await loadConversation(item.id);
    };

    list.appendChild(btn);
  });
}

async function loadConversations() {
  const response = await fetch("/conversations");

  if (await handleUnauthorized(response)) {
    return [];
  }

  const items = await response.json();
  renderConversationList(items);
  return items;
}

async function loadConversation(conversationId) {
  currentConversationId = conversationId;

  const response = await fetch(`/conversations/${conversationId}/messages`);

  if (await handleUnauthorized(response)) {
    return;
  }

  const messages = await response.json();

  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML = "";

  messages.forEach(msg => {
    const sender = msg.sender === "user" ? "user" : "bot";
    addMessage(sender, msg.message);
  });

  await loadConversations();
  scrollToBottom();
}

async function startNewChat() {
  const response = await fetch("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Chat" })
  });

  if (await handleUnauthorized(response)) {
    return;
  }

  const data = await response.json();
  currentConversationId = data.id;

  document.getElementById("chat-box").innerHTML = "";
  await loadConversations();
  document.getElementById("message").focus();
}

async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById("message");
  const typing = document.getElementById("typing");
  const message = input.value.trim();

  if (!message) return;

  lastUserMessage = message;
  isSending = true;

  if (currentConversationId === null) {
    await startNewChat();

    if (currentConversationId === null) {
      isSending = false;
      return;
    }
  }

  addMessage("user", message);
  input.value = "";

  typing.classList.remove("hidden");

  try {
    const response = await fetch("/chat-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        conversation_id: currentConversationId
      })
    });

    if (await handleUnauthorized(response)) {
      typing.classList.add("hidden");
      isSending = false;
      return;
    }

    typing.classList.add("hidden");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const botElement = addMessage("bot", "");

    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullText += chunk;

      streamText(botElement, chunk);
    }

    botElement.innerHTML = formatMarkdown(fullText);

    await loadConversations();

  } catch (error) {
    typing.classList.add("hidden");
    addMessage("bot", "⚠️ Streaming failed. Try again.");
  }

  isSending = false;
}

async function clearCurrentChat() {
  if (!currentConversationId) return;

  const response = await fetch(`/conversations/${currentConversationId}/clear`, {
    method: "POST"
  });

  if (await handleUnauthorized(response)) {
    return;
  }

  document.getElementById("chat-box").innerHTML = "";
  await loadConversations();
}


async function logoutUser() {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login";
}

document.getElementById("message").addEventListener("keypress", function (e) {
  if (e.key === "Enter") sendMessage();
});

async function init() {
  const items = await loadConversations();

  if (items.length > 0) {
    await loadConversation(items[0].id);
  }

let currentConversationId = null;
let isSending = false;
let lastUserMessage = "";

function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

function scrollToBottom() {
  const chatBox = document.getElementById("chat-box");
  chatBox.scrollTop = chatBox.scrollHeight;
}

function formatMarkdown(text) {
  return text
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

async function handleUnauthorized(response) {
  if (response.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

function addMessage(sender, text = "") {
  const chatBox = document.getElementById("chat-box");

  const wrapper = document.createElement("div");
  wrapper.classList.add("message-wrapper");

  const div = document.createElement("div");
  div.classList.add("message", sender);

  if (sender === "bot") {
    div.innerHTML = formatMarkdown(text);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.innerText = "Copy";

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(div.innerText);
      copyBtn.innerText = "Copied!";
      setTimeout(() => (copyBtn.innerText = "Copy"), 1000);
    };

    wrapper.appendChild(div);
    wrapper.appendChild(copyBtn);
  } else {
    div.textContent = text;
    wrapper.appendChild(div);
  }

  chatBox.appendChild(wrapper);
  scrollToBottom();

  return div;
}

function streamText(element, chunk) {
  const cursor = '<span class="cursor">|</span>';
  element.innerHTML = formatMarkdown(element.textContent + chunk) + cursor;
  scrollToBottom();
}

async function regenerateResponse() {
  if (!lastUserMessage) return;

  document.getElementById("message").value = lastUserMessage;
  sendMessage();
}

function renderConversationList(items) {
  const list = document.getElementById("conversation-list");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<div class="empty-history">No chats yet</div>`;
    return;
  }

  items.forEach(item => {
    const btn = document.createElement("button");
    btn.className = "conversation-item";

    if (Number(currentConversationId) === Number(item.id)) {
      btn.classList.add("active");
    }

    btn.innerHTML = `
      <div class="conversation-title">${item.title}</div>
      <div class="conversation-preview">${item.last_message || "No messages yet"}</div>
      <div class="conversation-date">${item.created_at}</div>
    `;

    btn.onclick = async () => {
      currentConversationId = item.id;
      await loadConversation(item.id);
    };

    list.appendChild(btn);
  });
}

async function loadConversations() {
  const response = await fetch("/conversations");

  if (await handleUnauthorized(response)) {
    return [];
  }

  const items = await response.json();
  renderConversationList(items);
  return items;
}

async function loadConversation(conversationId) {
  currentConversationId = conversationId;

  const response = await fetch(`/conversations/${conversationId}/messages`);

  if (await handleUnauthorized(response)) {
    return;
  }

  const messages = await response.json();

  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML = "";

  messages.forEach(msg => {
    const sender = msg.sender === "user" ? "user" : "bot";
    addMessage(sender, msg.message);
  });

  await loadConversations();
  scrollToBottom();
}

async function startNewChat() {
  const response = await fetch("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "New Chat" })
  });

  if (await handleUnauthorized(response)) {
    return;
  }

  const data = await response.json();
  currentConversationId = data.id;

  document.getElementById("chat-box").innerHTML = "";
  await loadConversations();
  document.getElementById("message").focus();
}

async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById("message");
  const typing = document.getElementById("typing");
  const message = input.value.trim();

  if (!message) return;

  lastUserMessage = message;
  isSending = true;

  if (currentConversationId === null) {
    await startNewChat();

    if (currentConversationId === null) {
      isSending = false;
      return;
    }
  }

  addMessage("user", message);
  input.value = "";

  typing.classList.remove("hidden");

  try {
    const response = await fetch("/chat-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        conversation_id: currentConversationId
      })
    });

    if (await handleUnauthorized(response)) {
      typing.classList.add("hidden");
      isSending = false;
      return;
    }

    typing.classList.add("hidden");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    const botElement = addMessage("bot", "");

    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullText += chunk;

      streamText(botElement, chunk);
    }

    botElement.innerHTML = formatMarkdown(fullText);

    await loadConversations();

  } catch (error) {
    typing.classList.add("hidden");
    addMessage("bot", "⚠️ Streaming failed. Try again.");
  }

  isSending = false;
}

async function clearCurrentChat() {
  if (!currentConversationId) return;

  const response = await fetch(`/conversations/${currentConversationId}/clear`, {
    method: "POST"
  });

  if (await handleUnauthorized(response)) {
    return;
  }

  document.getElementById("chat-box").innerHTML = "";
  await loadConversations();
}


async function logoutUser() {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login";
}

document.getElementById("message").addEventListener("keypress", function (e) {
  if (e.key === "Enter") sendMessage();
});

(async function init() {
  const items = await loadConversations();

  if (items.length > 0) {
    await loadConversation(items[0].id);
  }

})();}