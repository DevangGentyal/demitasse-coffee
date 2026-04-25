import { useNavigate } from "react-router-dom";

export default function HeaderBar() {

  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/menu");
    }
  };

  return (
    <div className="flex justify-between items-center px-4 py-3">

      <button
        onClick={goBack}
        className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow"
      >
        ←
      </button>

      <button
        className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow"
      >
        ♡
      </button>

    </div>
  );
}