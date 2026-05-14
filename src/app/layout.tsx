import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html>
    <head>
      {process.env.NODE_ENV === "development" && (
        <Script
          src="//unpkg.com/react-grab/dist/index.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
          data-options={JSON.stringify({
            activationMode: "hold",
            keyHoldDuration: 150,
            allowActivationInsideInput: true,
            maxContextLines: 10
          })}
        />
      )}
    </head>
    <body>{children}</body>
    </html>
  );
}







