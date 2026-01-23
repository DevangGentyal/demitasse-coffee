export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Demitasse Coffee ☕
          </h1>
          <p className="text-gray-500 mt-2">
            Order fresh coffee from your table
          </p>
        </div>

        {/* Action */}
        <button className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition">
          View Menu
        </button>

        {/* Info */}
        <div className="mt-6 space-y-3 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>No app install</span>
            <span>📱</span>
          </div>
          <div className="flex justify-between">
            <span>Secure payment</span>
            <span>🔒</span>
          </div>
          <div className="flex justify-between">
            <span>Loyalty rewards</span>
            <span>⭐</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          Scan QR • Order • Enjoy
        </div>

      </div>
    </div>
  )
}
