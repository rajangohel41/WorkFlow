import { forwardRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

export const PasswordInput = forwardRef(function PasswordInput(
  {
    icon = true,
    className = "",
    placeholder = "••••••••",
    id,
    ...props
  },
  ref
) {
  const [show, setShow] = useState(false);

  return (
    <div className={`password-input-wrap ${icon ? "has-icon" : ""}`}>
      {icon && <LockKeyhole className="password-input-icon" size={17} />}
      <input
        ref={ref}
        id={id}
        type={show ? "text" : "password"}
        className={`input ${className}`}
        placeholder={placeholder}
        {...props}
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={() => setShow((prev) => !prev)}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
        tabIndex={0}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
});

export default PasswordInput;
