import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// This is the function we are testing. Ideally, it would be imported from './PromptSelector.tsx'.
// For this testing environment, we are defining it here.
// This definition should mirror the actual implementation in PromptSelector.tsx.
const actualApplyProcessedContent = (
  content: string,
  targetElement: any,
  onClose: () => void,
) => {
  const editableElement = targetElement._element as HTMLElement;
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    console.error("Quick Prompt: No selection found. Cannot apply prompt or remove /p trigger.");
    onClose();
    return;
  }

  const range = selection.getRangeAt(0); // Direct use as per latest version
  const cursorNode = range.startContainer;
  const cursorPos = range.startOffset;

  let textNodeWithTrigger: Text | null = null;
  let triggerStartPosition = -1;

  if (cursorNode.nodeType === Node.TEXT_NODE && cursorPos >= 2) {
    const textContent = cursorNode.textContent || "";
    const textBeforeCursor = textContent.substring(cursorPos - 2, cursorPos);
    if (textBeforeCursor.toLowerCase() === "/p") {
      textNodeWithTrigger = cursorNode as Text;
      triggerStartPosition = cursorPos - 2;
    }
  }

  if (textNodeWithTrigger && triggerStartPosition !== -1) {
    const triggerRange = document.createRange(); // Uses mocked createRange
    triggerRange.setStart(textNodeWithTrigger, triggerStartPosition);
    triggerRange.setEnd(textNodeWithTrigger, triggerStartPosition + 2);

    const beforeDeleteEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });

    if (!editableElement.dispatchEvent(beforeDeleteEvent)) {
      console.log("Quick Prompt: Deletion of /p canceled by beforeinput event.");
      onClose();
      return;
    }
    triggerRange.deleteContents(); // Calls mocked deleteContents
    // Ensure selection is updated (range should be collapsed at the deletion point)
    selection.removeAllRanges();
    selection.addRange(range); 
  } else {
    console.warn("Quick Prompt: Could not find /p immediately before cursor for precise DOM deletion. /p may not be removed.");
  }

  const contentTextNode = document.createTextNode(content);
  const beforeInsertEvent = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: content,
  });

  if (!editableElement.dispatchEvent(beforeInsertEvent)) {
    console.log("Quick Prompt: Insertion of prompt content canceled by beforeinput event.");
    onClose();
    return;
  }

  range.insertNode(contentTextNode); // Calls mocked insertNode

  // Move cursor after inserted content
  range.setStartAfter(contentTextNode);
  range.setEndAfter(contentTextNode);
  selection.removeAllRanges();
  selection.addRange(range);

  editableElement.focus();
  onClose();
};
// End of actualApplyProcessedContent definition

describe('applyProcessedContent for contenteditable elements', () => {
  let mockEditableElement: HTMLDivElement;
  let mockTargetElement: any;
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockRange: Range;
  let mockSelection: Selection;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  // Store original functions
  let originalGetSelection: typeof window.getSelection;
  let originalCreateRange: typeof document.createRange;

  beforeEach(() => {
    mockEditableElement = document.createElement('div');
    mockEditableElement.setAttribute('contenteditable', 'true');
    document.body.appendChild(mockEditableElement); // Add to body for some DOM operations if necessary

    mockEditableElement.focus = vi.fn();
    // Default: dispatchEvent returns true (event not cancelled)
    mockEditableElement.dispatchEvent = vi.fn().mockReturnValue(true);

    mockTargetElement = { _element: mockEditableElement };
    mockOnClose = vi.fn();

    // Mock Range object
    // Its properties (startContainer, startOffset) will be set per test
    mockRange = document.createRange(); // Use a real range object that can be manipulated by spies
                                        // We will spy on its methods instead of full mocking if possible
    
    vi.spyOn(mockRange, 'deleteContents').mockImplementation(() => {
      const { startContainer, startOffset, endOffset } = mockRange;
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer as Text;
        textNode.nodeValue = textNode.nodeValue!.substring(0, startOffset) + textNode.nodeValue!.substring(endOffset);
        // After deletion, range is usually collapsed at startOffset
        mockRange.setEnd(startContainer, startOffset);
      }
    });

    vi.spyOn(mockRange, 'insertNode').mockImplementation((newNode) => {
        const { startContainer, startOffset } = mockRange;
        if (startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = startContainer as Text;
            const val = textNode.nodeValue || "";
            const before = val.substring(0, startOffset);
            const after = val.substring(startOffset);
            textNode.nodeValue = before + (newNode as Text).nodeValue + after;
            // Move range after the inserted node
            mockRange.setStart(textNode, startOffset + (newNode as Text).nodeValue!.length);
            mockRange.setEnd(textNode, startOffset + (newNode as Text).nodeValue!.length);
        } else { // If inserting into an element (e.g. empty div)
            const currentRange = selection.getRangeAt(0);
            currentRange.startContainer.insertBefore(newNode, currentRange.startContainer.childNodes[currentRange.startOffset]);
        }
    });
    vi.spyOn(mockRange, 'setStartAfter');
    vi.spyOn(mockRange, 'setEndAfter');
    vi.spyOn(mockRange, 'setStart');
    vi.spyOn(mockRange, 'setEnd');


    // Mock Selection object
    mockSelection = {
      getRangeAt: vi.fn(() => mockRange),
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      rangeCount: 1,
      // Dummy implementations for other selection properties/methods
      anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0,
      isCollapsed: true, type: 'None', collapse: vi.fn(), collapseToEnd: vi.fn(),
      collapseToStart: vi.fn(), containsNode: vi.fn(() => false), deleteFromDocument: vi.fn(),
      extend: vi.fn(), selectAllChildren: vi.fn(), setBaseAndExtent: vi.fn(),
      toString: vi.fn(() => ""), getComposedRanges: vi.fn(), modify: vi.fn(),
    } as unknown as Selection;

    originalGetSelection = window.getSelection;
    window.getSelection = vi.fn(() => mockSelection);
    
    originalCreateRange = document.createRange;
    // Make document.createRange return OUR mockRange instance for the triggerRange
    // This is crucial for testing the triggerRange's deleteContents
    document.createRange = vi.fn(() => mockRange); 

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    window.getSelection = originalGetSelection;
    document.createRange = originalCreateRange; // Restore original
    vi.restoreAllMocks(); // Restores all spies and mocks
    if (mockEditableElement.parentNode === document.body) {
      document.body.removeChild(mockEditableElement);
    }
  });

  const setupTextNodeAndSelection = (initialText: string, cursorPosition: number) => {
    const textNode = document.createTextNode(initialText);
    mockEditableElement.innerHTML = ''; // Clear previous content
    mockEditableElement.appendChild(textNode);
    
    // Set the range properties on the *single* mockRange instance
    mockRange.setStart(textNode, cursorPosition);
    mockRange.setEnd(textNode, cursorPosition);
    
    // Ensure getRangeAt(0) returns this configured range
    (mockSelection.getRangeAt as ReturnType<typeof vi.fn>).mockReturnValue(mockRange);
    // Ensure createRange also returns this for triggerRange
    (document.createRange as ReturnType<typeof vi.fn>).mockReturnValue(mockRange);
  };

  it('Test 1: should remove /p and insert prompt content correctly', () => {
    const initialText = "Hello /p";
    const promptText = "my prompt";
    const finalText = "Hello my prompt";
    setupTextNodeAndSelection(initialText, initialText.length); // Cursor after "/p"

    actualApplyProcessedContent(promptText, mockTargetElement, mockOnClose);

    expect(mockEditableElement.textContent).toBe(finalText);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockEditableElement.focus).toHaveBeenCalledTimes(1);
    expect(mockRange.deleteContents).toHaveBeenCalledTimes(1);
    expect(mockRange.insertNode).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('Test 2: should remove /P (uppercase) and insert prompt content', () => {
    const initialText = "Hello /P";
    const promptText = "new prompt";
    const finalText = "Hello new prompt";
    setupTextNodeAndSelection(initialText, initialText.length); // Cursor after "/P"

    actualApplyProcessedContent(promptText, mockTargetElement, mockOnClose);

    expect(mockEditableElement.textContent).toBe(finalText);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockEditableElement.focus).toHaveBeenCalledTimes(1);
    expect(mockRange.deleteContents).toHaveBeenCalledTimes(1);
    expect(mockRange.insertNode).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('Test 3: /p not immediately before cursor; should warn and insert prompt, /p remains', () => {
    const initialText = "Hello /p world";
    const promptText = "inserted";
    // Cursor is at the end of "world"
    // Expected: "Hello /p worldinserted" - /p is not removed by precise logic
    const finalText = "Hello /p worldinserted";
    setupTextNodeAndSelection(initialText, initialText.length); // Cursor after "world"
    
    actualApplyProcessedContent(promptText, mockTargetElement, mockOnClose);

    expect(mockEditableElement.textContent).toBe(finalText);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Quick Prompt: Could not find /p immediately before cursor for precise DOM deletion. /p may not be removed."
    );
    expect(mockRange.deleteContents).not.toHaveBeenCalled(); // Crucial: deleteContents for /p should not be called
    expect(mockRange.insertNode).toHaveBeenCalledTimes(1); // Prompt still inserted
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockEditableElement.focus).toHaveBeenCalledTimes(1);
  });
  
  it('Test 4: beforeinput event cancellation for deletion of /p', () => {
    const initialText = "Cancel /p";
    const promptText = "this should not appear";
    setupTextNodeAndSelection(initialText, initialText.length); // Cursor after "/p"

    // Mock dispatchEvent for the deletion to return false (cancelled)
    mockEditableElement.dispatchEvent = vi.fn()
      .mockImplementationOnce((event: Event) => event.type === 'beforeinput' && (event as InputEvent).inputType === 'deleteContentBackward' ? false : true);

    actualApplyProcessedContent(promptText, mockTargetElement, mockOnClose);

    expect(mockEditableElement.textContent).toBe(initialText); // Content should not change
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockEditableElement.focus).not.toHaveBeenCalled(); // Focus should not be called if operation cancelled early
    expect(mockRange.deleteContents).not.toHaveBeenCalled();
    expect(mockRange.insertNode).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith("Quick Prompt: Deletion of /p canceled by beforeinput event.");
  });

  it('Test 5: beforeinput event cancellation for insertion of prompt', () => {
    const initialText = "Insert /p here";
    const promptText = "this will be cancelled";
    const finalTextAfterDelete = "Insert  here"; // /p removed
    setupTextNodeAndSelection(initialText, initialText.indexOf('/p') + 2); // Cursor after "/p"

    // Mock dispatchEvent: first (delete) allows, second (insert) cancels
    let callCount = 0;
    mockEditableElement.dispatchEvent = vi.fn().mockImplementation((event: Event) => {
      callCount++;
      if (callCount === 1 && event.type === 'beforeinput' && (event as InputEvent).inputType === 'deleteContentBackward') {
        return true; // Allow deletion
      }
      if (callCount === 2 && event.type === 'beforeinput' && (event as InputEvent).inputType === 'insertText') {
        return false; // Cancel insertion
      }
      return true;
    });

    actualApplyProcessedContent(promptText, mockTargetElement, mockOnClose);

    expect(mockEditableElement.textContent).toBe(finalTextAfterDelete); // /p removed
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockEditableElement.focus).not.toHaveBeenCalled(); // Focus should not be called if insertion cancelled
    expect(mockRange.deleteContents).toHaveBeenCalledTimes(1); // Deletion happened
    expect(mockRange.insertNode).not.toHaveBeenCalled();    // Insertion did not happen
    expect(consoleLogSpy).toHaveBeenCalledWith("Quick Prompt: Insertion of prompt content canceled by beforeinput event.");
  });
});
