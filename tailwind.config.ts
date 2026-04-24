import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        headline: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Material 3 tokens for Precision Architect module
        "on-primary": "var(--m3-on-primary, #ffffff)",
        "primary-container": "var(--m3-primary-container, #008378)",
        "on-primary-container": "var(--m3-on-primary-container, #ffffff)",
        "primary-fixed-dim": "var(--m3-primary-fixed-dim, #6bd8cb)",
        surface: "var(--m3-surface, #f7f9fb)",
        "surface-bright": "var(--m3-surface-bright, #f7f9fb)",
        "surface-dim": "var(--m3-surface-dim, #d8dadc)",
        "surface-container": "var(--m3-surface-container, #eceef0)",
        "surface-container-low": "var(--m3-surface-container-low, #f2f4f6)",
        "surface-container-high": "var(--m3-surface-container-high, #e6e8ea)",
        "surface-container-highest": "var(--m3-surface-container-highest, #e0e3e5)",
        "surface-container-lowest": "var(--m3-surface-container-lowest, #ffffff)",
        "on-surface": "var(--m3-on-surface, #191c1e)",
        "on-surface-variant": "var(--m3-on-surface-variant, #3d4947)",
        outline: "var(--m3-outline, #6d7a77)",
        "outline-variant": "var(--m3-outline-variant, #bcc9c6)",
        tertiary: "var(--m3-tertiary, #924628)",
        "tertiary-container": "var(--m3-tertiary-container, #b05e3d)",
        error: "var(--m3-error, #ba1a1a)",
        "error-container": "var(--m3-error-container, #ffdad6)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "tab-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(1.2)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "tab-pulse": "tab-pulse 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
