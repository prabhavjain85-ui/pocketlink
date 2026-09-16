import React, { useState } from "react";
import SeoIntroLinks from "./SeoIntroLinks";

function AddressIcon() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M16 28s9-8.2 9-14.5C25 8.5 21 5 16 5s-9 3.5-9 8.5C7 19.8 16 28 16 28z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="16" cy="13.5" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M10 7.5h3.2l1.4 4.2-2 1.2a12.5 12.5 0 0 0 6.5 6.5l1.2-2 4.2 1.4V22c0 1.4-1.2 2.5-2.6 2.2C12.4 22.6 9.4 19.6 7.8 10.1 7.5 8.7 8.6 7.5 10 7.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="6" y="9" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 11l9 7 9-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const INFO_CARDS = [
  {
    kind: "address",
    label: "Address",
    icon: <AddressIcon />,
    detail: "Lucknow, Uttar Pradesh, India",
  },
  {
    kind: "phone",
    label: "Phone",
    icon: <PhoneIcon />,
    detail: (
      <a href="tel:+919530402100">+91-9530402100</a>
    ),
  },
  {
    kind: "email",
    label: "Email",
    icon: <EmailIcon />,
    detail: (
      <a href="mailto:prabhavjain85@gmail.com">prabhavjain85@gmail.com</a>
    ),
  },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus("error");
      setError("Name, email, and message are all required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("error");
      setError("A valid email is required.");
      return;
    }
    setStatus("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, _gotcha: honeypot }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Couldn't send your message. Please try again.");
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Couldn't send your message. Please try again.");
    }
  };

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · get in touch</div>
        <h1>Contact us</h1>
        <p>
          Questions about TargetForge workflows, collaborations, or feedback on computational drug discovery tools —
          send a note and we will get back to you.
        </p>
        <SeoIntroLinks currentPath="/contact" />
      </div>

      <div className="contact-cards">
        {INFO_CARDS.map((card) => (
          <div className="panel contact-info-card" key={card.kind}>
            <div className="panel-head">
              <span className={"station-icon icon-" + card.kind}>
                {card.icon}
              </span>
              <div>
                <div className="panel-eyebrow">{card.label}</div>
                <div className="contact-info-detail">{card.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="contact-form-wrap">
        <div className="panel">
          <div className="panel-head">
            <span className="station-icon icon-handoff">
              <svg viewBox="0 0 32 32" width="18" height="18" fill="none" aria-hidden="true">
                <path d="M7 10h18v12H7z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M7 10l9 8 9-8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className="panel-eyebrow">Send a message</div>
              <div className="panel-title">Name, email, and what you need</div>
            </div>
          </div>
          <div className="panel-body">
            {status === "sent" ? (
              <div className="recommend" role="status">
                <div className="recommend-label">Message sent</div>
                <div className="winner-reason">
                  Thanks — we received your note and will reply by email.
                </div>
                <div className="handoff-actions" style={{ marginTop: 14 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => setStatus("idle")}>
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <div className="hint" style={{ margin: "0 0 14px" }}>
                  All three fields are required. We only use this to reply to you.
                </div>
                <div className="form-grid">
                  <label className="form-field">
                    <span className="copyfield-label">Name</span>
                    <input
                      className="field-input"
                      name="name"
                      autoComplete="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label className="form-field">
                    <span className="copyfield-label">Email</span>
                    <input
                      className="field-input"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className="form-field form-field-full">
                    <span className="copyfield-label">Message</span>
                    <textarea
                      className="field-input"
                      name="message"
                      placeholder="How can we help?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      maxLength={4000}
                    />
                  </label>
                </div>
                <label className="hp-field" aria-hidden="true">
                  Company
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
                {error && <div className="error-msg" role="alert">{error}</div>}
                <div className="handoff-actions">
                  <button className="btn btn-target" type="submit" disabled={status === "sending"}>
                    {status === "sending" ? <span className="spinner" /> : null}
                    {status === "sending" ? "Sending…" : "Send message"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
