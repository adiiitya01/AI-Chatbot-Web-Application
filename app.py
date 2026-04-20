from flask import Flask, render_template, request, jsonify, redirect, session, Response, stream_with_context
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from groq import Groq
from google import genai
import os
import time

from database import (
    init_db,
    create_user,
    get_user_by_email,
    create_conversation,
    get_user_conversations,
    get_conversation_messages,
    save_message,
    clear_conversation_messages,
    conversation_belongs_to_user,
    update_conversation_title,
)

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "secret")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

init_db()


def current_user_id():
    return session.get("user_id")


def is_logged_in():
    return current_user_id() is not None


def get_stored_password(user):
    if not user:
        return None

    keys = user.keys()

    if "password" in keys:
        return user["password"]
    if "password_hash" in keys:
        return user["password_hash"]

    return None


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "").strip()

        print("LOGIN EMAIL:", email)

        if not email or not password:
            return render_template("login.html", error="Email and password are required.")

        user = get_user_by_email(email)
        print("USER FOUND:", user)

        stored_password = get_stored_password(user)
        print("USER KEYS:", list(user.keys()) if user else "No user")

        if user and stored_password and check_password_hash(stored_password, password):
            session["user_id"] = user["id"]
            session["user_name"] = user["name"]
            print("LOGIN SUCCESS")
            return redirect("/")

        print("LOGIN FAILED")
        return render_template("login.html", error="Invalid email or password.")

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        raw_password = request.form.get("password", "").strip()

        if not name or not email or not raw_password:
            return render_template("register.html", error="All fields are required.")

        existing_user = get_user_by_email(email)
        if existing_user:
            return render_template("register.html", error="Email already registered.")

        hashed_password = generate_password_hash(raw_password)
        create_user(name, email, hashed_password)

        return redirect("/login")

    return render_template("register.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.route("/")
def home():
    if not is_logged_in():
        return redirect("/login")
    return render_template("index.html", user_name=session.get("user_name", "User"))


def simple_reply(msg):
    msg = msg.lower().strip()

    if msg in ["hi", "hello", "hii", "hiii"]:
        return "Hello! How can I help you today?"
    if msg == "how are you":
        return "I'm doing great! How can I assist you?"
    if msg == "who are you":
        return "I'm your AI chatbot 🤖"

    return None


def gemini_response(prompt):
    if not client:
        return None
    try:
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt
        )
        return response.text
    except Exception as e:
        print("Gemini Error:", e)
        return None


def groq_response(prompt):
    if not groq_client:
        return None
    try:
        chat = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile"
        )
        return chat.choices[0].message.content
    except Exception as e:
        print("Groq Error:", e)
        return None


def get_ai_response(prompt):
    local = simple_reply(prompt)
    if local:
        return local

    res = gemini_response(prompt)
    if res:
        return res

    res = groq_response(prompt)
    if res:
        return res

    return "⚠️ AI services are busy. Try again later."


@app.route("/chat-stream", methods=["POST"])
def chat_stream():
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    conversation_id = data.get("conversation_id")

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    if conversation_id is None:
        conversation_id = create_conversation(current_user_id(), "New Chat")

    conversation_id = int(conversation_id)

    save_message(conversation_id, "user", user_message)
    update_conversation_title(conversation_id, user_message[:40])

    def generate():
        try:
            reply = get_ai_response(user_message)
            save_message(conversation_id, "bot", reply)

            for char in reply:
                yield char
                time.sleep(0.01)

        except Exception as e:
            yield "⚠️ Error: " + str(e)

    return Response(stream_with_context(generate()), mimetype="text/plain")


@app.route("/chat", methods=["POST"])
def chat():
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    conversation_id = data.get("conversation_id")

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    if conversation_id is None:
        conversation_id = create_conversation(current_user_id(), "New Chat")

    conversation_id = int(conversation_id)

    save_message(conversation_id, "user", user_message)
    update_conversation_title(conversation_id, user_message[:40])

    reply = get_ai_response(user_message)
    save_message(conversation_id, "bot", reply)

    return jsonify({
        "reply": reply,
        "conversation_id": conversation_id
    })


@app.route("/conversations", methods=["GET"])
def conversations():
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify(get_user_conversations(current_user_id()))


@app.route("/conversations", methods=["POST"])
def new_conversation():
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    title = data.get("title", "New Chat").strip() or "New Chat"

    conversation_id = create_conversation(current_user_id(), title)
    return jsonify({"id": conversation_id, "title": title}), 201


@app.route("/conversations/<int:conversation_id>/messages", methods=["GET"])
def conversation_messages(conversation_id):
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401

    if not conversation_belongs_to_user(conversation_id, current_user_id()):
        return jsonify({"error": "Conversation not found"}), 404

    return jsonify(get_conversation_messages(conversation_id))


@app.route("/conversations/<int:conversation_id>/clear", methods=["POST"])
def clear_conversation(conversation_id):
    if not is_logged_in():
        return jsonify({"error": "Unauthorized"}), 401

    if not conversation_belongs_to_user(conversation_id, current_user_id()):
        return jsonify({"error": "Conversation not found"}), 404

    clear_conversation_messages(conversation_id)
    return jsonify({"message": "Conversation cleared"})


if __name__ == "__main__":
    app.run(debug=True)