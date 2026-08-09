import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * This exists for one reason: Safari on iPhone has no Fullscreen API, so the
 * button in the settings flyout cannot work there however it is written. The
 * route that *does* work is Add to Home Screen, and what makes that launch
 * without browser chrome — reclaiming the fifth of the screen the address
 * bar and the toolbar take, which in landscape is most of the room the
 * pedals need — is this file declaring `display: "fullscreen"`.
 *
 * `orientation: "landscape"` asks the same of the launcher that
 * `screen.orientation.lock` asks of the Fullscreen API, on the platforms
 * that honour it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Driving Simulator — Dhading to Kathmandu",
    short_name: "Driving Sim",
    description:
      "A browser-based first-person drive up the Prithvi Highway into Kathmandu.",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#000000",
    theme_color: "#000000",
  };
}
