import offerImg from "@/assets/home_screen/offer.png";

export default function OfferCard() {
  return (
    <div className="mx-4 mt-5 bg-gradient-to-r from-amber-900 to-amber-600 rounded-2xl p-4 text-white flex justify-between">
      <div>
        <h2 className="font-bold text-lg">Offer Title</h2>
        <p className="text-sm opacity-80 mt-1">
          detailsxxxxxxxxxxxxxxxx
        </p>

        <button className="mt-3 bg-white text-black px-4 py-2 rounded-full text-sm font-medium">
          BUY NOW
        </button>
      </div>

      <img src={offerImg} alt="offer" className="h-24" />
    </div>
  );
}
