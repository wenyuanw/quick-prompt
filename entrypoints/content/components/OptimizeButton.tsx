import React from 'react';

interface OptimizeButtonProps {
  onClick: () => void;
  // top and left are no longer needed as props for styling
}

const OptimizeButton: React.FC<OptimizeButtonProps> = ({ onClick }) => {
  const buttonStyle: React.CSSProperties = {
    // position: 'absolute', // Removed
    // top: `${top}px`, // Removed
    // left: `${left}px`, // Removed
    // zIndex: 2147483647, // Removed, will be on the shadow host
    display: 'block', // Make it a block element
    padding: '5px 10px',
    backgroundColor: 'white',
    border: '1px solid #ccc',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  return (
    <button style={buttonStyle} onClick={onClick}>
      Optimize Prompt
    </button>
  );
};

export default OptimizeButton;
