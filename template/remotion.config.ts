import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(16);

// ANGLE is the most reliable GL renderer on Windows for blur/shadow-heavy frames.
Config.setChromiumOpenGlRenderer("angle");
