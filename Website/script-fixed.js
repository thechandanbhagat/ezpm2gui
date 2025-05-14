document.addEventListener('DOMContentLoaded', function() {
    // Mobile Navigation Toggle
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            navLinks.classList.toggle('active');
            document.body.classList.toggle('nav-open');
        });
    }

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            if (this.getAttribute('href') !== '#') {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Close mobile nav if open
                    if (navLinks && navLinks.classList.contains('active')) {
                        navLinks.classList.remove('active');
                        mobileMenuBtn.classList.remove('active');
                        document.body.classList.remove('nav-open');
                    }
                }
            }
        });
    });

    // Screenshot Slider
    const screenshots = document.querySelectorAll('.screenshot');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (screenshots.length > 0 && prevBtn && nextBtn) {
        let currentIndex = 0;
        
        // Show initial screenshot
        screenshots[0].classList.add('active');
        
        function showSlide(index) {
            // Remove active class from all screenshots
            screenshots.forEach(slide => slide.classList.remove('active'));
            
            // Handle index wrapping
            if (index >= screenshots.length) {
                currentIndex = 0;
            } else if (index < 0) {
                currentIndex = screenshots.length - 1;
            } else {
                currentIndex = index;
            }
            
            // Add active class to current screenshot
            screenshots[currentIndex].classList.add('active');
        }
        
        // Previous button click
        prevBtn.addEventListener('click', () => {
            showSlide(currentIndex - 1);
        });
        
        // Next button click
        nextBtn.addEventListener('click', () => {
            showSlide(currentIndex + 1);
        });
        
        // Auto-slide functionality
        let slideInterval = setInterval(() => {
            showSlide(currentIndex + 1);
        }, 5000);
        
        // Pause auto-slide on mouse hover
        const sliderContainer = document.querySelector('.screenshot-slider');
        if (sliderContainer) {
            sliderContainer.addEventListener('mouseenter', () => {
                clearInterval(slideInterval);
            });
            
            sliderContainer.addEventListener('mouseleave', () => {
                slideInterval = setInterval(() => {
                    showSlide(currentIndex + 1);
                }, 5000);
            });
        }
    }
    
    // Installation Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button
                button.classList.add('active');
                
                // Show corresponding pane
                const targetId = button.getAttribute('data-target');
                const targetPane = document.getElementById(targetId);
                if (targetPane) {
                    targetPane.classList.add('active');
                }
            });
        });
    }
    
    // Code copy functionality
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    if (copyButtons.length > 0) {
        copyButtons.forEach(button => {
            button.addEventListener('click', () => {
                const code = button.getAttribute('data-code');
                if (code) {
                    navigator.clipboard.writeText(code).then(() => {
                        // Change icon to checkmark temporarily
                        const icon = button.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-check';
                            setTimeout(() => {
                                icon.className = 'fas fa-copy';
                            }, 2000);
                        }
                    }).catch(err => {
                        console.error('Could not copy text: ', err);
                    });
                }
            });
            
            // Add tooltip behavior
            button.addEventListener('mouseenter', function() {
                const tooltip = document.createElement('span');
                tooltip.className = 'tooltip';
                tooltip.textContent = 'Copy to clipboard';
                this.appendChild(tooltip);
            });
            
            button.addEventListener('mouseleave', function() {
                const tooltip = this.querySelector('.tooltip');
                if (tooltip) {
                    tooltip.remove();
                }
            });
        });
    }
    
    // Sticky Navigation
    const glassNav = document.querySelector('.glass-nav');
    
    if (glassNav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                glassNav.classList.add('scrolled');
            } else {
                glassNav.classList.remove('scrolled');
            }
        });
    }
    
    // Animate elements on scroll
    const animatedElements = document.querySelectorAll('.feature-card, .doc-card, .install-step, .section-header');
    
    if (animatedElements.length > 0) {
        // Create Intersection Observer
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        
        // Observe each element
        animatedElements.forEach(element => {
            element.classList.add('fade-in-element');
            observer.observe(element);
        });
    }
    
    // Initialize particles background if the element exists
    const particlesBg = document.getElementById('particles-bg');
    if (particlesBg && typeof particlesJS !== 'undefined') {
        particlesJS('particles-bg', {
            "particles": {
                "number": {
                    "value": 80,
                    "density": {
                        "enable": true,
                        "value_area": 800
                    }
                },
                "color": {
                    "value": "#ffffff"
                },
                "shape": {
                    "type": "circle",
                    "stroke": {
                        "width": 0,
                        "color": "#000000"
                    }
                },
                "opacity": {
                    "value": 0.5,
                    "random": false,
                    "anim": {
                        "enable": false,
                        "speed": 1,
                        "opacity_min": 0.1,
                        "sync": false
                    }
                },
                "size": {
                    "value": 3,
                    "random": true,
                    "anim": {
                        "enable": false,
                        "speed": 40,
                        "size_min": 0.1,
                        "sync": false
                    }
                },
                "line_linked": {
                    "enable": true,
                    "distance": 150,
                    "color": "#ffffff",
                    "opacity": 0.4,
                    "width": 1
                },
                "move": {
                    "enable": true,
                    "speed": 2,
                    "direction": "none",
                    "random": false,
                    "straight": false,
                    "out_mode": "out",
                    "bounce": false
                }
            },
            "interactivity": {
                "detect_on": "canvas",
                "events": {
                    "onhover": {
                        "enable": true,
                        "mode": "repulse"
                    },
                    "onclick": {
                        "enable": true,
                        "mode": "push"
                    },
                    "resize": true
                },
                "modes": {
                    "repulse": {
                        "distance": 100,
                        "duration": 0.4
                    },
                    "push": {
                        "particles_nb": 4
                    }
                }
            },
            "retina_detect": true
        });
    }
    
    // Add smooth appearance effect when page loads
    window.addEventListener('load', function() {
        document.body.classList.add('page-loaded');
        
        // Reveal hero content elements with sequential animation
        const heroElements = document.querySelectorAll('.hero-content > *');
        heroElements.forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('reveal');
            }, 200 * index);
        });
    });
    
    // Improve code copy functionality with tooltip
    function updateCopyButtonText(button, text, reset = true) {
        const originalText = button.getAttribute('data-original-text') || '';
        
        if (!button.getAttribute('data-original-text')) {
            button.setAttribute('data-original-text', button.innerHTML);
        }
        
        button.innerHTML = text;
        
        if (reset) {
            setTimeout(() => {
                button.innerHTML = originalText;
            }, 2000);
        }
    }
    
    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;
    
    // Check for saved theme preference or use default
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    // Apply the saved theme on load
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeIcon) {
            themeIcon.className = 'fas fa-sun';
        }
    }
    
    // Toggle theme when the button is clicked
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            
            // Update the icon
            if (themeIcon) {
                if (document.body.classList.contains('light-theme')) {
                    themeIcon.className = 'fas fa-sun';
                    localStorage.setItem('theme', 'light');
                } else {
                    themeIcon.className = 'fas fa-moon';
                    localStorage.setItem('theme', 'dark');
                }
            }
            
            // Add a cool transition effect
            document.body.style.transition = 'background-color 0.5s ease, color 0.5s ease';
            setTimeout(() => {
                document.body.style.transition = '';
            }, 500);
        });
    }
    
    // Back to top button functionality
    const backToTopBtn = document.getElementById('backToTop');
    
    if (backToTopBtn) {
        // Show/hide the button based on scroll position
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });
        
        // Scroll to top when clicked
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});
