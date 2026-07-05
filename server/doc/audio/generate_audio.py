#!/usr/bin/env python3
"""
Mission Barisal v3 — Audio Generation Script
Uses Microsoft Edge TTS (edge-tts) for high-quality Bengali speech synthesis.
Voice: bn-BD-PradeepNeural (Male, Bangladesh)

Output: MP3 files split by chapter (6 parts + full version)
"""

import asyncio
import edge_tts
import os
import re

# Output directory
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Voice configuration
VOICE = "bn-BD-PradeepNeural"  # Microsoft Neural TTS — Bengali (Bangladesh, Male)
RATE = "+0%"   # Normal speed
VOLUME = "+0%" # Normal volume

# Chapter definitions from audio-script.md
CHAPTERS = {
    "01-shuru": {
        "title": "পর্ব ১: শুরু",
        "text": """আসসালামু আলাইকুম! আমি সাহোন। আজ আমি আপনাদের সাথে পরিচয় করিয়ে দিতে চাই একটা অসাধারণ জিনিসের — 'মিশন বরিশাল'।

আপনি কি কখনও ভেবেছেন, একটা প্রশ্নের উত্তর যদি ছয়জন বিশেষজ্ঞ মিলে আলোচনা করে দিতো, তাহলে কত ভালো হতো? ধরুন, আপনি আপনার দোকানের জন্য একটা ওয়েবসাইট বানাতে চান। আপনি প্রোগ্রামিং জানেন না। কী করবেন?

মিশন বরিশাল ঠিক এই কাজটাই করে। এটা একটা প্রযুক্তি যা আপনার প্রশ্ন নিয়ে ছয়টা বুদ্ধিমান সিস্টেমের মধ্যে আলোচনা শুরু করে দেয়। আর তারা মিলে আপনাকে একটা নির্ভুল উত্তর দেয়।

আমি জানি, 'ছয়টা বুদ্ধিমান সিস্টেম' শুনে আপনি ভয় পেয়ে যেতে পারেন। কিন্তু ভয়ের কিছু নেই। আমি গল্প দিয়ে বোঝাবো।"""
    },
    "02-rahim-saheb": {
        "title": "পর্ব ২: গল্প — রহিম সাহেব",
        "text": """রহিম সাহেবের কথা বলি। রহিম সাহেব একজন স্কুল টিচার। তিনি তার ছাত্রদের জন্য গণিত শেখার একটা ওয়েবসাইট বানাতে চান।

তিনি কম্পিউটার চালাতে পারেন, কিন্তু প্রোগ্রামিং জানেন না। উনি মিশন বরিশালকে গিয়ে বললেন: 'আমার ছাত্রদের জন্য একটা গণিত শেখার ওয়েবসাইট দরকার।'

মিশন বরিশাল তখন তার ছয় বন্ধুকে ডাকল:

প্রথম বন্ধু — মনু। সে সবার বড়। ও সিস্টেম ডিজাইন করে। কীভাবে ওয়েবসাইট হবে, কোন পেজে কী থাকবে—সব প্ল্যান করে।

দ্বিতীয় বন্ধু — জারিন। সে সবসময় ভুল খোঁজে। মনু যা বানায়, জারিন চেক করে ভুল আছে কিনা।

তৃতীয় বন্ধু — বৃষ্টি। সে নিরাপত্তা দেখে। ওয়েবসাইট যেন নিরাপদ থাকে, কারও ডাটা যেন চুরি না হয়।

চতুর্থ বন্ধু — রাশেদ। সে স্পিড নিয়ে কাজ করে। ওয়েবসাইট যেন দ্রুত লোড হয়।

পঞ্চম বন্ধু — হালিম। সে ডকুমেন্টেশন লেখে। কীভাবে ওয়েবসাইট ব্যবহার করতে হবে, তার নিয়মকানুন লিখে রাখে।

ষষ্ঠ বন্ধু — মজনু। সে সবশেষে পুরো জিনিসটা ভালোভাবে চেক করে। কোনো ভুল থাকলে ধরে দেয়।

ছয় বন্ধু আলোচনা করে, একমত হয়ে রহিম সাহেবকে একটা চমৎকার ওয়েবসাইট বানিয়ে দেয়। রহিম সাহেব খুশি! তার ছাত্ররা এখন অনলাইনে গণিত শিখতে পারে।"""
    },
    "03-fatima-apa": {
        "title": "পর্ব ৩: গল্প — ফাতিমা আপা",
        "text": """আরেকটা গল্প বলি। ফাতিমা আপা বরিশালে একটা ছোট দোকান চালান। তার দোকানের জন্য একটা হিসাব রাখার সিস্টেম দরকার।

তিনি আগে এক্সেলে হিসাব রাখতেন। কিন্তু এক্সেল তার জন্য কঠিন ছিল। উনি মিশন বরিশালকে বললেন: 'আমার দোকানের বিক্রি আর লাভের হিসাব রাখার একটা সহজ ব্যবস্থা চাই।'

আবারও ছয় বন্ধু কাজ শুরু করল। মনু ডিজাইন করল একটা সহজ সফটওয়্যার। জারিন চেক করল কোনো ভুল আছে কিনা। বৃষ্টি নিশ্চিত করল ফাতিমা আপার ডাটা নিরাপদ থাকবে। রাশেদ সফটওয়্যারকে দ্রুত করল। হালিম লিখে দিল কীভাবে ব্যবহার করতে হবে। মজনু সবশেষে যাচাই করে নিল।

ফলাফল? ফাতিমা আপা এখন মোবাইল ফোন দিয়েই তার দোকানের হিসাব রাখতে পারেন। তাকে আর এক্সেল নিয়ে মাথা ঘামাতে হয় না!

দেখলেন? রহিম সাহেব আর ফাতিমা আপা — দুজনেই সাধারণ মানুষ। দুজনেই তাদের সমস্যার সমাধান পেয়েছেন, প্রোগ্রামিং না জেনেই।"""
    },
    "04-technical": {
        "title": "পর্ব ৪: একটু টেকনিক্যালি",
        "text": """এবার একটু টেকনিক্যালি বলি। কিন্তু ভয় পাবেন না, আমি সহজ ভাষায় বলবো।

মিশন বরিশাল মূলত একটা ছোট প্রোগ্রাম যা আপনার কম্পিউটারে চলে। এটা কোনো বড় কোম্পানির সার্ভারে চলে না — আপনার নিজের কম্পিউটারেই!

এই প্রোগ্রামের কোনো বাইরের নির্ভরতা নেই। মানে, এটা চালানোর জন্য আপনাকে হাজারটা জিনিস ইনস্টল করতে হবে না। শুধু Node.js থাকলেই হবে।

প্রোগ্রামটা যখন চালু করেন, তখন এটা চারটা ভিন্ন ভিন্ন AI প্রোভাইডারের সাথে কথা বলে। এদের মধ্যে আছে OpenCode, Groq, Gemini, আর একটা কাস্টম প্রক্সি।

একটা AI যদি কাজ না করে, তাহলে পরেরটা চেষ্টা করে। মানে, আপনার প্রশ্নের উত্তর না পেয়ে ফেরত আসার সম্ভাবনা খুবই কম। আমরা গাণিতিকভাবে প্রমাণ করেছি যে এই সিস্টেমের সাফল্যের হার ৯৫% এর বেশি।

আরেকটা বড় ফিচার: এই সিস্টেমটা আপনার প্রজেক্টের সব তথ্য নিজে নিজেই জেনে নেয়। আপনি যখন কোনো প্রজেক্ট নিয়ে কাজ করছেন, এটা আপনার ফাইল চেক করে বুঝে নেয় কী ধরনের প্রজেক্ট। ফলে এজেন্টরা প্রাসঙ্গিক উত্তর দিতে পারে।"""
    },
    "05-extension": {
        "title": "পর্ব ৫: VS Code এক্সটেনশন",
        "text": """আপনি যদি VS Code নামের একটা প্রোগ্রাম ব্যবহার করেন, তাহলে আপনার জন্য আরেকটা সুবিধা আছে। আমরা একটা এক্সটেনশন বানিয়েছি যা VS Code-এর সাথে মিশন বরিশালকে সংযুক্ত করে।

এই এক্সটেনশন ইনস্টল করলেই আপনি VS Code-এর ভেতরেই মিশন বরিশাল ব্যবহার করতে পারবেন। Copilot Chat-এর মতো পরিচিত ইন্টারফেস থেকে সরাসরি এজেন্টদের সাথে কথা বলতে পারবেন।

এক্সটেনশনটাতে আরও কিছু ফিচার আছে: একটা কাস্টম প্যানেল যেখানে এজেন্টদের স্ট্যাটাস দেখা যায়, একটা ট্রি ভিউ যেখানে সব এজেন্টের তালিকা আছে, আর MCP টুলস যা সরাসরি VS Code থেকে ইউজ করা যায়।

আমরা চেয়েছি প্রযুক্তি যেন সবার জন্য সহজ হয়। আপনার যদি VS Code থাকে, তাহলে কিছু কমান্ড দিয়েই মিশন বরিশাল ব্যবহার করতে পারবেন।"""
    },
    "06-summary": {
        "title": "পর্ব ৬: সমাপ্তি",
        "text": """তো বন্ধুরা, মিশন বরিশাল আসলে কী?

এটা একটা প্রযুক্তি যা: ছয়টা বিশেষজ্ঞ এজেন্টকে একসাথে কাজ করায়, আপনার প্রশ্নের নির্ভুল উত্তর দেয়, আপনার নিজের কম্পিউটারেই চলে, কোনো বাইরের নির্ভরতা নেই, আর বিনামূল্যে, সবার জন্য উন্মুক্ত।

আমরা বিশ্বাস করি, প্রযুক্তি সবার জন্য হওয়া উচিত। আপনি প্রোগ্রামিং জানুন বা না জানুন, আপনার প্রযুক্তিগত সমাধান পাওয়ার অধিকার আছে।

মিশন বরিশাল সেই অধিকার পূরণের একটা ছোট চেষ্টা।

আমি সাহোন। আমার টিম আর আমি বরিশাল, বাংলাদেশ থেকে এই প্রজেক্ট তৈরি করছি। আমাদের গিটহাবে ফলো করতে পারেন, ইস্যু খুলতে পারেন, বা কন্ট্রিবিউট করতে পারেন।

প্রযুক্তি সবার জন্য। Technology For Everyone.

ধন্যবাদ!"""
    }
}

async def generate_audio(text: str, filename: str, label: str):
    """Generate MP3 audio from text using Microsoft Edge TTS."""
    filepath = os.path.join(OUTPUT_DIR, filename)
    print(f"🎧 Generating: {label} → {filename}")
    
    communicate = edge_tts.Communicate(
        text,
        VOICE,
        rate=RATE,
        volume=VOLUME
    )
    
    await communicate.save(filepath)
    
    # Get file size
    size_kb = os.path.getsize(filepath) / 1024
    print(f"   ✅ Saved: {filename} ({size_kb:.1f} KB)")
    return filepath

async def generate_full_audio(chapters: dict, filename: str):
    """Generate a single MP3 with all chapters concatenated."""
    print(f"\n📦 Generating full audio: {filename}")
    full_text = "\n\n".join(ch["text"] for ch in chapters.values())
    
    filepath = os.path.join(OUTPUT_DIR, filename)
    communicate = edge_tts.Communicate(
        full_text,
        VOICE,
        rate=RATE,
        volume=VOLUME
    )
    
    await communicate.save(filepath)
    size_kb = os.path.getsize(filepath) / 1024
    print(f"   ✅ Full audio saved: {filename} ({size_kb:.1f} KB)")

async def main():
    print("=" * 60)
    print("🎙️ Mission Barisal v3 — Audio Generator")
    print(f"🔊 Voice: {VOICE}")
    print(f"📁 Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    # Generate individual chapters
    print("\n📀 Generating chapter MP3s...")
    tasks = []
    for key, chapter in CHAPTERS.items():
        filename = f"mission-barisal-{key}.mp3"
        tasks.append(generate_audio(chapter["text"], filename, chapter["title"]))
    
    await asyncio.gather(*tasks)
    
    # Generate full version
    await generate_full_audio(CHAPTERS, "mission-barisal-full.mp3")
    
    print("\n" + "=" * 60)
    print("✅ All audio files generated successfully!")
    print("=" * 60)
    
    # List all files
    print("\n📋 Generated Files:")
    for f in sorted(os.listdir(OUTPUT_DIR)):
        if f.endswith(".mp3"):
            size = os.path.getsize(os.path.join(OUTPUT_DIR, f)) / 1024
            print(f"   🎵 {f} — {size:.1f} KB")

if __name__ == "__main__":
    asyncio.run(main())
