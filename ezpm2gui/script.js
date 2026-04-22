document.addEventListener("DOMContentLoaded", function() {
    // Mobile Navigation Toggle
    const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
    const navLinks = document.querySelector(".nav-links");
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener("click", function() {
            this.classList.toggle("active");
            navLinks.classList.toggle("active");
            document.body.classList.toggle("nav-open");
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll("a[href^=\"#\"]").forEach(anchor => {
        anchor.addEventListener("click", function(e) {
            if (this.getAttribute("href") !== "#") {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute("href"));
                if (target) {
                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                    
                    // Close mobile nav if open
                    if (navLinks && navLinks.classList.contains("active")) {
                        navLinks.classList.remove("active");
                        mobileMenuBtn.classList.remove("active");
                        document.body.classList.remove("nav-open");
                    }
                }
            }
        });
    });

    // Screenshot Slider
    const screenshots = document.querySelectorAll(".screenshot");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    
    if (screenshots.length > 0 && prevBtn && nextBtn) {
        let currentIndex = 0;
        
        // Show initial screenshot
        screenshots[0].classList.add("active");
        
        function showSlide(index) {
            // Remove active class from all screenshots
            screenshots.forEach(slide => slide.classList.remove("active"));
            
            // Handle index wrapping
            if (index >= screenshots.length) {
                currentIndex = 0;
            } else if (index < 0) {
                currentIndex = screenshots.length - 1;
            } else {
                currentIndex = index;
            }
            
            // Add active class to current screenshot
            screenshots[currentIndex].classList.add("active");
        }
        
        // Previous button click
        prevBtn.addEventListener("click", () => {
            showSlide(currentIndex - 1);
        });
        
        // Next button click
        nextBtn.addEventListener("click", () => {
            showSlide(currentIndex + 1);
        });
        
        // Auto-slide functionality
        let slideInterval = setInterval(() => {
            showSlide(currentIndex + 1);
        }, 5000);
        
        // Pause auto-slide on mouse hover
        const sliderContainer = document.querySelector(".screenshot-slider");
        if (sliderContainer) {
            sliderContainer.addEventListener("mouseenter", () => {
                clearInterval(slideInterval);
            });
            
            sliderContainer.addEventListener("mouseleave", () => {
                slideInterval = setInterval(() => {
                    showSlide(currentIndex + 1);
                }, 5000);
            });
        }
    }
    
    // Installation Tabs
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");
    
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener("click", () => {
                // Remove active class from all buttons
                tabButtons.forEach(btn => btn.classList.remove("active"));
                
                // Add active class to clicked button
                button.classList.add("active");
                
                // Get target tab pane
                const targetTab = button.getAttribute("data-target");
                
                // Hide all tab panes
                tabPanes.forEach(pane => pane.classList.remove("active"));
                
                // Show target tab pane
                document.getElementById(targetTab).classList.add("active");
            });
        });
    }
    
    // Feature Tabs
    const featureTabButtons = document.querySelectorAll(".feature-tab-btn");
    const featureTabPanes = document.querySelectorAll(".feature-tab-pane");
    
    if (featureTabButtons.length > 0) {
        featureTabButtons.forEach(button => {
            button.addEventListener("click", () => {
                // Remove active class from all buttons
                featureTabButtons.forEach(btn => btn.classList.remove("active"));
                
                // Add active class to clicked button
                button.classList.add("active");
                
                // Get target tab pane
                const targetTab = button.getAttribute("data-target");
                
                // Hide all tab panes with smooth transition
                featureTabPanes.forEach(pane => {
                    pane.classList.remove("active");
                    pane.style.opacity = "0";
                });
                
                // Show target tab pane with animation
                const targetPane = document.getElementById(targetTab);
                if (targetPane) {
                    setTimeout(() => {
                        targetPane.classList.add("active");
                        setTimeout(() => {
                            targetPane.style.opacity = "1";
                            
                            // Re-trigger animations for cards in the active tab
                            const cards = targetPane.querySelectorAll('.feature-card');
                            cards.forEach((card, index) => {
                                card.classList.remove('animated');
                                setTimeout(() => {
                                    card.classList.add('animated');
                                }, index * 100);
                            });
                        }, 50);
                    }, 200);
                }
            });
        });
    }
    
    // Copy Code functionality
    const copyButtons = document.querySelectorAll(".copy-btn");
    
    if (copyButtons.length > 0) {
        copyButtons.forEach(button => {
            button.addEventListener("click", () => {
                // Get the code to copy
                const codeToCopy = button.getAttribute("data-code");
                
                // Create a temporary textarea element
                const textarea = document.createElement("textarea");
                textarea.value = codeToCopy;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                
                // Select and copy the text
                textarea.select();
                document.execCommand("copy");
                
                // Remove the textarea
                document.body.removeChild(textarea);
                
                // Provide visual feedback
                const originalIcon = button.innerHTML;
                button.innerHTML = "<i class=\"fas fa-check\"></i>";
                
                // Reset icon after 2 seconds
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                }, 2000);
                
                // Add tooltip
                const tooltip = document.createElement("div");
                tooltip.className = "tooltip";
                tooltip.textContent = "Copied!";
                button.appendChild(tooltip);
                
                // Remove tooltip after animation completes
                setTimeout(() => {
                    button.removeChild(tooltip);
                }, 2000);
            });
        });
    }
    
    // Animate features when they come into view
    const animateFeatures = () => {
        const fadeElements = document.querySelectorAll(".fade-in-element");
        const highlightCards = document.querySelectorAll(".feature-highlight-card");
        const windowHeight = window.innerHeight;
        
        // Animate fade-in elements
        fadeElements.forEach(element => {
            const elementPosition = element.getBoundingClientRect().top;
            const elementVisible = 150;
            
            if (elementPosition < windowHeight - elementVisible) {
                element.classList.add("animated");
            }
        });
        
        // Animate highlight cards with a special effect
        highlightCards.forEach((card, index) => {
            const elementPosition = card.getBoundingClientRect().top;
            const elementVisible = 150;
            
            if (elementPosition < windowHeight - elementVisible) {
                // Add a slight delay between cards
                setTimeout(() => {
                    card.classList.add("animated");
                }, index * 200);
            }
        });
    };
    
    // Run on load
    animateFeatures();
    
    // Run on scroll
    window.addEventListener("scroll", animateFeatures);
    
    // Theme toggle functionality
    const themeToggle = document.getElementById("themeToggle");
    const body = document.body;
    const savedTheme = localStorage.getItem("theme");
    
    // Apply saved theme on load
    if (savedTheme === "light") {
        body.classList.add("light-theme");
        if (themeToggle) {
            themeToggle.innerHTML = "<i class=\"fas fa-sun\"></i>";
        }
    }
    
    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            // Toggle theme class
            body.classList.toggle("light-theme");
            
            // Save theme preference
            if (body.classList.contains("light-theme")) {
                localStorage.setItem("theme", "light");
                themeToggle.innerHTML = "<i class=\"fas fa-sun\"></i>";
            } else {
                localStorage.setItem("theme", "dark");
                themeToggle.innerHTML = "<i class=\"fas fa-moon\"></i>";
            }
            
            // Reinitialize particles with theme-specific colors
            initializeParticlesWithTheme();
        });
    }
    
    // Function to initialize particles with theme-specific colors
    function initializeParticlesWithTheme() {
        const particlesBg = document.getElementById("particles-bg");
        
        if (particlesBg && typeof particlesJS !== "undefined") {
            const isLightTheme = document.body.classList.contains("light-theme");
            const particleColor = isLightTheme ? "#4f46e5" : "#ffffff";
            
            setTimeout(() => {
                particlesJS("particles-bg", {
                    "particles": {
                        "number": { "value": 80, "density": { "enable": true, "value_area": 800 } },
                        "color": { "value": particleColor },
                        "shape": { "type": "circle", "stroke": { "width": 0, "color": "#000000" } },
                        "opacity": { "value": 0.5, "random": false, "anim": { "enable": false } },
                        "size": { "value": 3, "random": true, "anim": { "enable": false } },
                        "line_linked": {
                            "enable": true,
                            "distance": 150,
                            "color": particleColor,
                            "opacity": isLightTheme ? 0.2 : 0.4,
                            "width": 1
                        },
                        "move": { "enable": true, "speed": 2, "direction": "none", "random": false, "straight": false, "out_mode": "out", "bounce": false }
                    },
                    "interactivity": {
                        "detect_on": "canvas",
                        "events": {
                            "onhover": { "enable": true, "mode": "repulse" },
                            "onclick": { "enable": true, "mode": "push" },
                            "resize": true
                        }
                    },
                    "retina_detect": true
                });
            }, 300);
        }
    }
    
    // Initialize particles background with theme-aware colors
    initializeParticlesWithTheme();
    
    // Back to top button functionality
    const backToTopBtn = document.getElementById("backToTop");
    
    if (backToTopBtn) {
        // Show/hide the button based on scroll position
        window.addEventListener("scroll", () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add("visible");
            } else {
                backToTopBtn.classList.remove("visible");
            }
        });
        
        // Scroll to top when clicked
        backToTopBtn.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }
    
    // Add touch swipe support for the screenshot slider on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    const sliderContainer = document.querySelector(".screenshot-slider");
    if (sliderContainer && screenshots.length > 0) {
        sliderContainer.addEventListener("touchstart", e => {
            touchStartX = e.changedTouches[0].screenX;
        }, false);
        
        sliderContainer.addEventListener("touchend", e => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, false);
        
        function handleSwipe() {
            if (touchEndX < touchStartX - 50) {
                // Swipe left, show next slide
                showSlide(currentIndex + 1);
            }
            
            if (touchEndX > touchStartX + 50) {
                // Swipe right, show previous slide
                showSlide(currentIndex - 1);
            }
        }
    }

    // Mark page as loaded for fade-in effect
    document.body.classList.add("page-loaded");
});
